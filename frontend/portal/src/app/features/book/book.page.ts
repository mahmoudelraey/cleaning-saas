import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription, debounceTime, from, of, switchMap, catchError, map, mergeMap } from 'rxjs';

import { Address, Booked, Item, PaymentMethod, PublicReviews, Quote, Service, Slot } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { LocalDatePipe, SAUDI_MOBILE, SarPipe, formatDate } from '../../core/format';
import { LanguageService } from '../../core/language.service';
import { PortalApi } from '../../core/portal.api';
import { defaultServiceImage, serviceIcon } from '../../core/service-image';
import { ServiceTextPipe, quoteLine, serviceWithOption } from '../../core/service-names';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast';

type Step = 1 | 2 | 3 | 4;

interface Pick {
  service: Service;
  /** The chosen size / type when the service has options (required then). */
  optionId: string | null;
  quantity: number;
  addonIds: string[];
}

const PAYMENTS: PaymentMethod[] = ['CASH', 'MADA', 'BANK_TRANSFER', 'APPLE_PAY', 'CARD'];

/**
 * Four real steps: what, when, where, confirm. Prices and open times come from the company's own rules.
 * Step 1 ("Selected service") shows one service at a time (pills switch it) next to a sticky order summary with
 * the promo code and, for visitors, signing in with a mobile code right there, then on to the time and address.
 */
@Component({
  selector: 'pt-book',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, TranslatePipe, LocalDatePipe, SarPipe, ServiceTextPipe],
  styleUrl: './book.page.scss',
  templateUrl: './book.page.html',
})
export class BookPage implements OnInit, OnDestroy {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(ToastService);
  protected readonly lang = inject(LanguageService);

  protected readonly payments = PAYMENTS;
  protected readonly step = signal<Step>(1);
  protected readonly services = signal<Service[]>([]);
  protected readonly picks = signal<Pick[]>([]);
  /** Labels of the four steps, for the stepper. */
  protected readonly stepNames = ['book.stepService', 'book.stepSchedule', 'book.stepLocation', 'book.stepConfirm'];
  /** With one measured service picked, its quantity for the summary bar (e.g. "Area 100 m²"). */
  protected readonly singleQty = computed(() => {
    const l = this.picks();
    if (l.length !== 1 || l[0].service.pricingType === 'FIXED') return null;
    return { type: l[0].service.pricingType, value: l[0].quantity };
  });
  /** The service chosen on the company page (?service=): shown alone until "Add another service". */
  protected readonly focused = signal<Service | null>(null);
  protected readonly quote = signal<Quote | null>(null);
  protected readonly date = signal('');
  protected readonly slots = signal<Slot[]>([]);
  protected readonly slot = signal<Slot | null>(null);
  protected readonly loadingSlots = signal(false);
  protected readonly addresses = signal<Address[]>([]);
  /** For the rating chip on the service banner. */
  protected readonly reviews = signal<PublicReviews | null>(null);
  protected readonly addressId = signal<string | null>(null);
  protected readonly payment = signal<PaymentMethod | null>(null);
  protected readonly busy = signal(false);
  protected readonly booked = signal<Booked | null>(null);
  protected city = '';
  protected district = '';
  protected details = '';
  protected mapUrl = '';
  protected notes = '';

  private readonly quote$ = new Subject<void>();

  // --- promo code ---
  protected promoInput = '';
  /** The code sent with every quote; the server's answer says whether it applies. */
  private readonly promoCode = signal<string | null>(null);
  protected readonly promoError = signal<string | null>(null);
  protected readonly checkingPromo = signal(false);

  protected readonly days = computed(() => {
    const c = this.store.company();
    const lang = this.lang.current();
    const out: { iso: string; weekday: string; day: string; month: string }[] = [];
    const today = new Date();
    for (let i = 0; i < Math.min(c?.maxDaysAhead ?? 30, 14); i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ iso, weekday: formatDate(d, 'weekday', lang), day: formatDate(d, 'dayNum', lang), month: formatDate(d, 'month', lang) });
    }
    return out;
  });

  protected readonly canNext = computed(() => {
    switch (this.step()) {
      case 1:
        return this.picks().length > 0 && !this.missingOption() && !!this.quote();
      case 2:
        return !!this.slot();
      default:
        return true;
    }
  });

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessions = inject(SessionService);

  /** Visitors can look at a service and its price; choosing a time and booking needs a signed-in customer. */
  protected readonly signedIn = computed(() => {
    const s = this.sessions.get(this.store.slug());
    return !!s && !s.needsName;
  });

  /** A picked service still waits for its size / type. */
  protected readonly missingOption = computed(() => this.picks().some((p) => !!p.service.options?.length && !p.optionId));

  /** The lowest option price ("from …"), or the service price without options. */
  protected fromPrice(s: Service): number {
    return s.options?.length ? Math.min(...s.options.map((o) => o.priceHalalas)) : s.basePriceHalalas;
  }

  /** A picked service with its chosen option, e.g. "Car wash (Large car)". */
  protected pickName(p: Pick): string {
    return serviceWithOption(p.service, p.optionId, this.lang.current());
  }

  /** A price-summary line in the visitor's language. */
  protected line(item: Quote['items'][number]): string {
    return quoteLine(item, this.services(), this.lang.current());
  }

  ngOnInit(): void {
    const slug = this.store.slug();
    // ?service=<id> comes from the public company page: start with that service picked.
    const preselect = this.route.snapshot.queryParamMap.get('service');
    // ?promo=CODE comes from the announcement bar: try it as soon as there is something to price.
    const promo = this.normalizeCode(this.route.snapshot.queryParamMap.get('promo') ?? '');
    if (promo) {
      this.promoInput = promo;
      this.promoCode.set(promo);
    }
    this.api.reviews(slug).subscribe({ next: (r) => this.reviews.set(r), error: () => {} });
    this.api.services(slug).subscribe({
      next: (s) => {
        this.services.set(s);
        // Without ?service= the first service is shown; the pills switch it.
        const chosen = preselect ? s.find((x) => x.id === preselect) : s[0];
        if (chosen && !this.picked(chosen)) {
          this.toggle(chosen);
          this.focused.set(chosen);
          // The company page's cost estimator also passes ?qty= and ?addons=a,b: start from that estimate.
          const pick = this.pickOf(chosen);
          const params = this.route.snapshot.queryParamMap;
          const qty = Number(params.get('qty'));
          const addons = (params.get('addons') ?? '').split(',').filter((id) => chosen.addons.some((a) => a.id === id));
          const option = params.get('option');
          if (pick && option && chosen.options?.some((o) => o.id === option)) {
            this.pickOption(pick, option);
          }
          if (pick && chosen.pricingType !== 'FIXED' && qty > 0) {
            this.setQty(pick, qty);
          }
          if (pick && addons.length) {
            addons.forEach((id) => this.toggleAddon(pick, id));
          }
        }
      },
      error: (e) => this.fail(e),
    });
    if (this.signedIn()) this.loadAddresses();
    this.quote$
      .pipe(
        debounceTime(200),
        switchMap(() =>
          this.items().length ? this.api.quote(slug, this.items(), this.promoCode()).pipe(catchError(() => of(null))) : of(null),
        ),
      )
      .subscribe((q) => this.onQuote(q));
  }

  ngOnDestroy(): void {
    this.quote$.complete();
    this.countsSub?.unsubscribe();
    if (this.gTimer) clearInterval(this.gTimer);
  }

  private loadAddresses(): void {
    this.api.me(this.store.slug()).subscribe({
      next: (p) => {
        this.addresses.set(p.addresses);
        this.addressId.set(p.addresses.at(-1)?.id ?? null);
      },
    });
  }

  /** The service pills: show another service instead of the current one. */
  protected switchService(s: Service): void {
    if (this.focused()?.id === s.id) return;
    this.picks.set([]);
    this.focused.set(s);
    this.toggle(s);
  }

  /** Number of each settings group of a service (size, quantity, add-ons), so they count only what it has. */
  protected groupNo(s: Service, kind: 'size' | 'qty' | 'addons'): number {
    const order = [s.options?.length ? 'size' : null, s.pricingType !== 'FIXED' ? 'qty' : null, s.addons.length ? 'addons' : null]
      .filter(Boolean);
    return order.indexOf(kind) + 1;
  }

  protected duration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return this.translate.instant('company.minutes', { m });
    return m ? this.translate.instant('company.hoursMinutes', { h, m }) : this.translate.instant('company.hours', { h });
  }

  /** What is left to pay before VAT (subtotal − promo). */
  protected readonly net = computed(() => {
    const q = this.quote();
    return q ? q.totalHalalas ?? q.subtotalHalalas : 0;
  });
  /** VAT: included in the prices, added on top, or none (company not registered). */
  protected readonly vat = computed(() => {
    const c = this.store.company();
    const net = this.net();
    if (!c?.vatRegistered || !net) return null;
    return c.pricesIncludeVat
      ? { included: true, amount: Math.round(net - net / 1.15) }
      : { included: false, amount: Math.round(net * 0.15) };
  });
  protected readonly grandTotal = computed(() => {
    const v = this.vat();
    return this.net() + (v && !v.included ? v.amount : 0);
  });

  // --- signing in from the summary (visitors) -------------------------------------------------------
  protected readonly gStep = signal<'phone' | 'code' | 'name'>('phone');
  protected readonly gBusy = signal(false);
  protected readonly gError = signal<string | null>(null);
  protected readonly gDevCode = signal<string | null>(null);
  protected readonly gResendIn = signal(0);
  protected gPhone = '';
  protected gCode = '';
  protected gName = '';
  private gTimer: ReturnType<typeof setInterval> | null = null;
  /** The signed-in customer's mobile, for the "verified" chip. */
  protected readonly signedPhone = computed(() => this.sessions.get(this.store.slug())?.phone ?? '');

  protected sendGateCode(): void {
    const raw = this.gPhone.replace(/[\s-]/g, '');
    if (!SAUDI_MOBILE.test(raw)) {
      this.gError.set(this.translate.instant('errors.invalid_phone'));
      return;
    }
    this.gBusy.set(true);
    this.gError.set(null);
    this.api.sendCode(this.store.slug(), raw).subscribe({
      next: (r) => {
        this.gBusy.set(false);
        this.gDevCode.set(r.devCode ?? null);
        this.gCode = '';
        this.gStep.set('code');
        this.gCountdown(r.resendAfterSeconds);
      },
      error: (e) => this.gFail(e),
    });
  }

  protected onGateCode(): void {
    this.gCode = this.gCode.replace(/\D/g, '').slice(0, 6);
    if (this.gCode.length === 6 && !this.gBusy()) this.verifyGateCode();
  }

  protected verifyGateCode(): void {
    this.gBusy.set(true);
    this.gError.set(null);
    this.api.verify(this.store.slug(), this.gPhone.replace(/[\s-]/g, ''), this.gCode).subscribe({
      next: (s) => {
        this.gBusy.set(false);
        this.sessions.set(this.store.slug(), s);
        if (s.needsName) this.gStep.set('name');
        else this.afterSignIn();
      },
      error: (e) => this.gFail(e),
    });
  }

  protected saveGateName(): void {
    this.gBusy.set(true);
    this.gError.set(null);
    this.api.register(this.store.slug(), this.gName.trim()).subscribe({
      next: (s) => {
        this.gBusy.set(false);
        this.sessions.set(this.store.slug(), s);
        this.afterSignIn();
      },
      error: (e) => this.gFail(e),
    });
  }

  /** Signed in from the summary: load the saved addresses and go on to the time. */
  private afterSignIn(): void {
    this.loadAddresses();
    if (this.canNext()) this.forward();
  }

  private gFail(e: unknown): void {
    this.gBusy.set(false);
    this.gError.set(errorMessage(e, this.translate));
  }

  private gCountdown(seconds: number): void {
    if (this.gTimer) clearInterval(this.gTimer);
    this.gResendIn.set(seconds);
    this.gTimer = setInterval(() => {
      this.gResendIn.update((v) => Math.max(0, v - 1));
      if (this.gResendIn() === 0 && this.gTimer) clearInterval(this.gTimer);
    }, 1000);
  }

  // --- step 1 ---
  protected icon(s: Service | undefined): string {
    return s ? serviceIcon(s.name, s.nameEn) : 'pi-sparkles';
  }

  protected defaultImage(s: Service): string {
    return defaultServiceImage(s.name, s.nameEn);
  }

  /** An uploaded photo that can't be loaded falls back to the default picture (once). */
  protected imageFailed(e: Event, s: Service): void {
    const img = e.target as HTMLImageElement;
    const fallback = this.defaultImage(s);
    if (!img.src.endsWith(fallback)) img.src = fallback;
  }

  protected picked(s: Service): boolean {
    return this.picks().some((p) => p.service.id === s.id);
  }

  protected pickOf(s: Service): Pick | undefined {
    return this.picks().find((p) => p.service.id === s.id);
  }

  protected step1(s: Service): number {
    return s.pricingType === 'PER_SQM' ? 10 : 1;
  }

  toggle(s: Service): void {
    this.picks.update((l) =>
      this.picked(s)
        ? l.filter((p) => p.service.id !== s.id)
        : [...l, { service: s, optionId: s.options?.length === 1 ? s.options[0].id : null, quantity: s.pricingType === 'HOURLY' ? 3 : s.pricingType === 'PER_SQM' ? 100 : 1, addonIds: [] }],
    );
    this.changed();
  }

  setQty(p: Pick, q: number): void {
    p.quantity = Math.max(this.step1(p.service), Math.min(p.service.pricingType === 'PER_SQM' ? 5000 : 24, q));
    this.picks.update((l) => [...l]);
    this.changed();
  }

  pickOption(p: Pick, id: string): void {
    p.optionId = id;
    this.picks.update((l) => [...l]);
    this.changed();
  }

  toggleAddon(p: Pick, id: string): void {
    p.addonIds = p.addonIds.includes(id) ? p.addonIds.filter((x) => x !== id) : [...p.addonIds, id];
    this.picks.update((l) => [...l]);
    this.changed();
  }

  private items(): Item[] {
    return this.picks().map((p) => ({
      serviceId: p.service.id,
      optionId: p.optionId,
      quantity: p.service.pricingType === 'FIXED' ? null : p.quantity,
      addonIds: p.addonIds,
    }));
  }

  private changed(): void {
    this.slot.set(null);
    this.slots.set([]);
    this.date.set('');
    this.quote$.next();
  }

  // --- step 2 ---
  /** Open times per day for the date strip (undefined while still loading); refreshed when the order changes. */
  protected readonly dayCounts = signal<Record<string, number>>({});
  private countsFor = '';
  private countsSub: Subscription | null = null;

  /** The selected day's times, grouped as morning (before 12), afternoon (12–5 pm) and evening. */
  protected readonly periods = computed(() => {
    const groups: { key: 'morning' | 'afternoon' | 'evening'; slots: Slot[] }[] = [
      { key: 'morning', slots: [] },
      { key: 'afternoon', slots: [] },
      { key: 'evening', slots: [] },
    ];
    for (const s of this.slots()) {
      const h = new Date(s.start).getHours();
      groups[h < 12 ? 0 : h < 17 ? 1 : 2].slots.push(s);
    }
    return groups.filter((g) => g.slots.length);
  });

  /** The first day with open times after the selected one (for the empty state). */
  protected readonly nextOpenDay = computed(() => {
    const counts = this.dayCounts();
    const days = this.days();
    const from = days.findIndex((d) => d.iso === this.date());
    return days.slice(from + 1).find((d) => (counts[d.iso] ?? 0) > 0) ?? null;
  });

  protected dayStatus(iso: string): 'loading' | 'open' | 'limited' | 'full' {
    const n = this.dayCounts()[iso];
    return n === undefined ? 'loading' : n === 0 ? 'full' : n <= 3 ? 'limited' : 'open';
  }

  /** Asks for every day's open times, four at a time, so the strip can show which days are open or full. */
  private loadDayCounts(): void {
    const key = JSON.stringify(this.items());
    if (key === this.countsFor) return;
    this.countsFor = key;
    this.countsSub?.unsubscribe();
    this.dayCounts.set({});
    const slug = this.store.slug();
    const items = this.items();
    this.countsSub = from(this.days().map((d) => d.iso))
      .pipe(
        mergeMap(
          (iso) => this.api.availability(slug, iso, items).pipe(map((l) => [iso, l.length] as const), catchError(() => of([iso, 0] as const))),
          4,
        ),
      )
      .subscribe(([iso, n]) => this.dayCounts.update((c) => ({ ...c, [iso]: n })));
  }

  /** Picks the earliest open day and its first time. */
  protected earliest(): void {
    const counts = this.dayCounts();
    const day = this.days().find((d) => (counts[d.iso] ?? 0) > 0);
    if (day) this.pickDate(day.iso, true);
    else this.toasts.show(this.translate.instant('book.noneOpen'), 'error');
  }

  protected scrollDays(strip: HTMLElement, dir: 1 | -1): void {
    const rtl = getComputedStyle(strip).direction === 'rtl';
    strip.scrollBy({ left: dir * (rtl ? -240 : 240), behavior: 'smooth' });
  }

  protected slotLabel(): string {
    const s = this.slot();
    if (!s) return '';
    const lang = this.lang.current();
    return `${formatDate(s.start, 'day', lang)} • ${formatDate(s.start, 'time', lang)}`;
  }

  pickDate(iso: string, firstSlot = false): void {
    this.date.set(iso);
    this.slot.set(null);
    this.loadingSlots.set(true);
    this.api.availability(this.store.slug(), iso, this.items()).subscribe({
      next: (s) => {
        this.slots.set(s);
        this.loadingSlots.set(false);
        this.dayCounts.update((c) => ({ ...c, [iso]: s.length }));
        if (firstSlot && s.length) this.slot.set(s[0]);
      },
      error: (e) => {
        this.loadingSlots.set(false);
        this.fail(e);
      },
    });
  }

  // --- step 3/4 ---
  protected addressLine(a: Address): string {
    return [a.district, a.city, a.details].filter(Boolean).join('، ');
  }

  protected whereText(): string {
    const id = this.addressId();
    if (id) {
      const a = this.addresses().find((x) => x.id === id);
      return a ? this.addressLine(a) || a.label || '' : '';
    }
    return [this.district, this.city, this.details].map((s) => s.trim()).filter(Boolean).join('، ') ||
      this.translate.instant('detail.noAddress');
  }

  protected whenText(iso: string): string {
    const lang = this.lang.current();
    return `${formatDate(iso, 'day', lang)} ${formatDate(iso, 'time', lang)}`;
  }

  forward(): void {
    if (this.step() === 1 && !this.signedIn()) {
      this.signInToContinue();
      return;
    }
    if (this.step() === 1) {
      this.loadDayCounts();
      if (!this.date()) this.pickDate(this.days()[0].iso);
    }
    this.step.update((s) => Math.min(4, s + 1) as Step);
    window.scrollTo({ top: 0 });
  }

  /** Sends a visitor to sign in, then back here with the same service, quantity, add-ons and promo code. */
  private signInToContinue(): void {
    const slug = this.store.slug();
    const pick = this.picks()[0];
    const params = new URLSearchParams();
    if (pick) {
      params.set('service', pick.service.id);
      if (pick.service.pricingType !== 'FIXED') params.set('qty', String(pick.quantity));
      if (pick.addonIds.length) params.set('addons', pick.addonIds.join(','));
      if (pick.optionId) params.set('option', pick.optionId);
    }
    if (this.promoCode()) params.set('promo', this.promoCode()!);
    const query = params.toString();
    void this.router.navigate(['/', slug, 'login'], { queryParams: { next: `/${slug}/book${query ? '?' + query : ''}` } });
  }

  back(): void {
    this.step.update((s) => Math.max(1, s - 1) as Step);
  }

  protected applyPromo(): void {
    const code = this.normalizeCode(this.promoInput);
    this.promoInput = code;
    this.promoError.set(null);
    if (!code) return;
    this.promoCode.set(code);
    this.checkingPromo.set(true);
    this.quote$.next();
  }

  protected removePromo(): void {
    this.promoCode.set(null);
    this.promoInput = '';
    this.promoError.set(null);
    this.quote$.next();
  }

  /** The price came back: if the code was refused, say why and price without it. */
  private onQuote(q: Quote | null): void {
    const asked = this.checkingPromo();
    this.checkingPromo.set(false);
    if (q?.promoError && this.promoCode()) {
      // A code from the announcement link that no longer fits is dropped quietly until the customer tries one.
      if (asked) this.promoError.set(this.promoMessage(q.promoError));
      this.promoCode.set(null);
      this.quote.set({ ...q, discountHalalas: 0, totalHalalas: q.subtotalHalalas, promo: undefined });
      return;
    }
    this.quote.set(q);
  }

  private promoMessage(code: string): string {
    const key = `errors.${code}`;
    const text = this.translate.instant(key);
    return text !== key ? text : this.translate.instant('errors.promo_not_found');
  }

  private normalizeCode(v: string): string {
    return v.trim().toUpperCase().replace(/\s+/g, '');
  }

  submit(): void {
    const slot = this.slot();
    if (!slot) {
      return;
    }
    this.busy.set(true);
    const newAddress = this.addressId() === null && (this.city || this.district || this.details || this.mapUrl)
      ? { city: this.city || null, district: this.district || null, details: this.details || null, mapUrl: this.mapUrl || null }
      : null;
    this.api
      .book(this.store.slug(), {
        items: this.items(),
        scheduledStart: slot.start,
        addressId: this.addressId(),
        address: newAddress,
        notes: this.notes.trim() || null,
        paymentMethod: this.payment(),
        promoCode: this.quote()?.promo?.code ?? null,
      })
      .subscribe({
        next: (b) => {
          this.busy.set(false);
          this.booked.set(b);
        },
        error: (e) => {
          this.busy.set(false);
          const code = (e?.error as { code?: string } | null)?.code;
          if (code?.startsWith('promo_')) {
            // The code stopped applying since it was checked (used up, expired...): price without it.
            this.promoError.set(this.promoMessage(code));
            this.promoCode.set(null);
            this.quote$.next();
            this.busy.set(false);
            return;
          }
          if (code === 'slot_unavailable') {
            // Someone took it meanwhile: back to the times, refreshed.
            this.step.set(2);
            this.pickDate(this.date());
          }
          this.fail(e);
        },
      });
  }

  private fail(e: unknown): void {
    this.toasts.show(errorMessage(e, this.translate), 'error');
  }
}
