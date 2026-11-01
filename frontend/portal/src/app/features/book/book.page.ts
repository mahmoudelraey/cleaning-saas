import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, debounceTime, of, switchMap, catchError } from 'rxjs';

import { Address, Booked, Item, PaymentMethod, Quote, Service, Slot } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { LocalDatePipe, SarPipe, formatDate } from '../../core/format';
import { LanguageService } from '../../core/language.service';
import { PortalApi } from '../../core/portal.api';
import { ToastService } from '../../core/toast';

type Step = 1 | 2 | 3 | 4;

interface Pick {
  service: Service;
  quantity: number;
  addonIds: string[];
}

const PAYMENTS: PaymentMethod[] = ['CASH', 'MADA', 'BANK_TRANSFER', 'APPLE_PAY', 'CARD'];

/** Four real steps: what, when, where, confirm. Prices and open times come from the company's own rules. */
@Component({
  selector: 'pt-book',
  imports: [FormsModule, RouterLink, TranslatePipe, LocalDatePipe, SarPipe],
  styles: `
    .top { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
    .close { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); color: var(--ink); text-decoration: none; }
    .steps { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .steps span { height: 5px; border-radius: 99px; background: var(--line); }
    .steps span.on { background: var(--tide); }
    h1 { font-size: 1.45rem; font-weight: 700; margin-bottom: 4px; }
    .lead { color: var(--ink-2); margin: 0 0 18px; }

    .svc { background: var(--surface); border-radius: var(--r-lg); padding: 16px 18px; margin-bottom: 10px; border: 2px solid transparent; cursor: pointer; }
    .svc.on { border-color: var(--tide); }
    .svc .line { display: flex; gap: 12px; align-items: flex-start; }
    .svc .tick { width: 24px; height: 24px; flex: none; border-radius: 8px; border: 2px solid var(--line); display: grid; place-items: center; color: #fff; margin-top: 2px; }
    .svc.on .tick { background: var(--tide); border-color: var(--tide); }
    .svc .name { flex: 1; font-weight: 700; }
    .svc .name small { display: block; font-weight: 400; color: var(--ink-2); font-size: .86rem; margin-top: 2px; }
    .svc .price { font-weight: 700; white-space: nowrap; }
    .svc .price small { font-weight: 400; color: var(--ink-2); }
    .extra { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--line); display: grid; gap: 10px; }
    .qty { display: flex; align-items: center; gap: 12px; }
    .qty button { width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--mist); font-size: 1.1rem; cursor: pointer; color: var(--ink); }
    .qty b { min-width: 36px; text-align: center; font-size: 1.15rem; }
    .addon { display: flex; align-items: center; gap: 10px; font-size: .95rem; cursor: pointer; }
    .addon input { width: 20px; height: 20px; accent-color: var(--tide); }
    .addon span { flex: 1; }

    .days { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; margin: 0 -16px 18px; padding-inline: 16px; scrollbar-width: none; }
    .days button { flex: none; width: 64px; padding: 10px 0; border-radius: 16px; border: 0; background: var(--surface); font: inherit; cursor: pointer; color: var(--ink); text-align: center; line-height: 1.2; }
    .days button small { display: block; color: var(--ink-2); font-size: .75rem; }
    .days button b { display: block; font-size: 1.3rem; }
    .days button.on { background: var(--ink); color: #fff; }
    .days button.on small { color: rgba(255,255,255,.75); }
    .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
    .slots button { min-height: 48px; border-radius: var(--r-md); border: 1.5px solid var(--line); background: var(--surface); font: inherit; font-weight: 600; cursor: pointer; color: var(--ink); }
    .slots button.on { background: var(--tide); border-color: var(--tide); color: #fff; }

    .choice { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; background: var(--surface); border-radius: var(--r-md); margin-bottom: 8px; cursor: pointer; border: 2px solid transparent; }
    .choice.on { border-color: var(--tide); }
    .choice input { margin-top: 4px; accent-color: var(--tide); width: 18px; height: 18px; }
    .choice small { display: block; color: var(--ink-2); }
    .pays { display: flex; flex-wrap: wrap; gap: 8px; }
    .pays button { border: 1.5px solid var(--line); background: var(--surface); border-radius: 999px; padding: 8px 16px; font: inherit; cursor: pointer; color: var(--ink); }
    .pays button.on { border-color: var(--tide); background: var(--foam); color: var(--tide-deep); font-weight: 600; }

    .sum dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 10px 16px; }
    .sum dt { color: var(--ink-2); }
    .sum dd { margin: 0; text-align: end; font-weight: 600; }

    .footer { position: fixed; inset-inline: 0; bottom: 0; background: var(--surface); border-top: 1px solid var(--line); z-index: 30;
              padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); }
    .footer .in { max-width: 640px; margin: 0 auto; display: flex; align-items: center; gap: 12px; }
    .footer .amt { flex: 1; line-height: 1.2; }
    .footer .amt small { color: var(--ink-2); display: block; font-size: .8rem; }
    .footer .amt b { font-size: 1.2rem; }

    .done { text-align: center; padding-top: 10vh; }
    .done .ok { width: 72px; height: 72px; border-radius: 50%; background: var(--foam); color: var(--tide); display: grid; place-items: center; margin: 0 auto 18px; font-size: 2rem; }
    .done p { color: var(--ink-2); max-width: 360px; margin: 8px auto 24px; }
  `,
  template: `
    <div class="page">
      @if (booked(); as b) {
        <div class="done">
          <div class="ok"><i class="pi pi-check"></i></div>
          <h1>{{ 'book.doneTitle' | translate }}</h1>
          <p>{{ 'book.doneLead' | translate: { n: b.number, when: whenText(b.scheduledStart) } }}</p>
          <a class="btn btn-primary" [routerLink]="['/p', store.slug(), 'bookings', b.id]">{{ 'book.viewBooking' | translate }}</a>
        </div>
      } @else if (!store.company()?.bookingOpen && store.company()) {
        <div class="sheet empty"><i class="pi pi-calendar-times"></i><p>{{ 'book.closed' | translate }}</p></div>
      } @else {
        <div class="top">
          <a class="close" [routerLink]="['/p', store.slug()]" [attr.aria-label]="'book.close' | translate"><i class="pi pi-times"></i></a>
          <div class="steps" aria-hidden="true">
            @for (s of [1, 2, 3, 4]; track s) { <span [class.on]="s <= step()"></span> }
          </div>
        </div>

        @switch (step()) {
          @case (1) {
            <h1>{{ 'book.s1' | translate }}</h1>
            <p class="lead">{{ 'book.s1Lead' | translate }}</p>
            @for (s of services(); track s.id) {
              <div class="svc" [class.on]="picked(s)" (click)="toggle(s)">
                <div class="line">
                  <span class="tick">@if (picked(s)) { <i class="pi pi-check" style="font-size:.7rem"></i> }</span>
                  <span class="name">{{ s.name }}@if (s.description) { <small>{{ s.description }}</small> }</span>
                  <span class="price"><span class="ltr">{{ s.basePriceHalalas | sar }}</span>@if (s.pricingType !== 'FIXED') { <small> / {{ 'book.unit.' + s.pricingType | translate }}</small> }</span>
                </div>
                @if (pickOf(s); as p) {
                  <div class="extra" (click)="$event.stopPropagation()">
                    @if (s.pricingType !== 'FIXED') {
                      <div class="qty">
                        <span style="flex:1">{{ 'book.qty.' + s.pricingType | translate }}</span>
                        <button type="button" (click)="setQty(p, p.quantity - step1(s))" [attr.aria-label]="'book.less' | translate">−</button>
                        <b class="tnum">{{ p.quantity }}</b>
                        <button type="button" (click)="setQty(p, p.quantity + step1(s))" [attr.aria-label]="'book.more' | translate">+</button>
                      </div>
                    }
                    @for (a of s.addons; track a.id) {
                      <label class="addon">
                        <input type="checkbox" [checked]="p.addonIds.includes(a.id)" (change)="toggleAddon(p, a.id)" />
                        <span>{{ a.name }}</span><span class="ltr muted">+{{ a.priceHalalas | sar }}</span>
                      </label>
                    }
                  </div>
                }
              </div>
            } @empty {
              <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
            }
          }
          @case (2) {
            <h1>{{ 'book.s2' | translate }}</h1>
            <p class="lead">{{ 'book.s2Lead' | translate: { h: store.company()?.leadTimeHours ?? 2 } }}</p>
            <div class="days">
              @for (d of days(); track d.iso) {
                <button type="button" [class.on]="date() === d.iso" (click)="pickDate(d.iso)">
                  <small>{{ d.weekday }}</small><b class="tnum">{{ d.day }}</b><small>{{ d.month }}</small>
                </button>
              }
            </div>
            @if (loadingSlots()) {
              <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
            } @else if (date() && !slots().length) {
              <div class="sheet empty"><i class="pi pi-clock"></i><p>{{ 'book.noSlots' | translate }}</p></div>
            } @else {
              <div class="slots">
                @for (s of slots(); track s.start) {
                  <button type="button" class="tnum" [class.on]="slot()?.start === s.start" (click)="slot.set(s)">{{ s.start | ldate: 'time' }}</button>
                }
              </div>
            }
          }
          @case (3) {
            <h1>{{ 'book.s3' | translate }}</h1>
            <p class="lead">{{ 'book.s3Lead' | translate }}</p>
            @for (a of addresses(); track a.id) {
              <label class="choice" [class.on]="addressId() === a.id">
                <input type="radio" name="addr" [checked]="addressId() === a.id" (change)="addressId.set(a.id)" />
                <span>{{ a.label || a.district || a.city }}<small>{{ addressLine(a) }}</small></span>
              </label>
            }
            <label class="choice" [class.on]="addressId() === null">
              <input type="radio" name="addr" [checked]="addressId() === null" (change)="addressId.set(null)" />
              <span>{{ 'book.newAddress' | translate }}</span>
            </label>
            @if (addressId() === null) {
              <div class="sheet" style="margin-bottom: 8px">
                <div class="field"><label for="ct">{{ 'book.city' | translate }}</label><input id="ct" class="input" [(ngModel)]="city" maxlength="80" /></div>
                <div class="field"><label for="ds">{{ 'book.district' | translate }}</label><input id="ds" class="input" [(ngModel)]="district" maxlength="80" /></div>
                <div class="field"><label for="dt">{{ 'book.details' | translate }}</label><input id="dt" class="input" [(ngModel)]="details" maxlength="300" [placeholder]="'book.detailsHint' | translate" /></div>
                <div class="field" style="margin:0"><label for="mp">{{ 'book.mapLink' | translate }}</label><input id="mp" class="input ltr" style="display:block" [(ngModel)]="mapUrl" maxlength="500" placeholder="https://maps.app.goo.gl/…" /><small>{{ 'book.mapHint' | translate }}</small></div>
              </div>
            }
            <h2 class="section-title">{{ 'book.payment' | translate }}</h2>
            <div class="pays">
              @for (m of payments; track m) {
                <button type="button" [class.on]="payment() === m" (click)="payment.set(payment() === m ? null : m)">{{ 'payment.' + m | translate }}</button>
              }
            </div>
            <h2 class="section-title">{{ 'book.notes' | translate }}</h2>
            <textarea class="input" rows="3" maxlength="1000" [(ngModel)]="notes" [placeholder]="'book.notesHint' | translate"></textarea>
          }
          @case (4) {
            <h1>{{ 'book.s4' | translate }}</h1>
            <p class="lead">{{ 'book.s4Lead' | translate }}</p>
            <section class="sheet sum">
              <dl>
                <dt>{{ 'book.when' | translate }}</dt><dd>{{ whenText(slot()!.start) }}</dd>
                <dt>{{ 'book.where' | translate }}</dt><dd>{{ whereText() }}</dd>
                <dt>{{ 'book.payment' | translate }}</dt><dd>{{ payment() ? ('payment.' + payment() | translate) : ('detail.notSet' | translate) }}</dd>
              </dl>
            </section>
            @if (quote(); as q) {
              <h2 class="section-title">{{ 'detail.services' | translate }}</h2>
              <section class="sheet sum">
                <dl>
                  @for (it of q.items; track $index) { <dt>{{ it.description }}</dt><dd class="ltr">{{ it.totalHalalas | sar }}</dd> }
                </dl>
              </section>
            }
            <p class="muted" style="font-size:.88rem; margin-top:14px">{{ 'book.confirmNote' | translate }}</p>
          }
        }
      }
    </div>

    @if (!booked() && store.company()?.bookingOpen) {
      <div class="footer">
        <div class="in">
          <div class="amt">
            <small>{{ 'detail.total' | translate }}</small>
            <b class="ltr">{{ (quote()?.subtotalHalalas ?? 0) | sar }}</b>
          </div>
          @if (step() > 1) { <button type="button" class="btn btn-quiet" (click)="back()">{{ 'book.back' | translate }}</button> }
          @if (step() < 4) {
            <button type="button" class="btn btn-primary" [disabled]="!canNext()" (click)="forward()">{{ 'book.next' | translate }}</button>
          } @else {
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="submit()">{{ 'book.confirm' | translate }}</button>
          }
        </div>
      </div>
    }
  `,
})
export class BookPage implements OnInit, OnDestroy {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(ToastService);
  private readonly lang = inject(LanguageService);

  protected readonly payments = PAYMENTS;
  protected readonly step = signal<Step>(1);
  protected readonly services = signal<Service[]>([]);
  protected readonly picks = signal<Pick[]>([]);
  protected readonly quote = signal<Quote | null>(null);
  protected readonly date = signal('');
  protected readonly slots = signal<Slot[]>([]);
  protected readonly slot = signal<Slot | null>(null);
  protected readonly loadingSlots = signal(false);
  protected readonly addresses = signal<Address[]>([]);
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

  protected readonly days = computed(() => {
    const c = this.store.company();
    const lang = this.lang.current();
    const out: { iso: string; weekday: string; day: string; month: string }[] = [];
    const today = new Date();
    for (let i = 0; i < Math.min(c?.maxDaysAhead ?? 30, 21); i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ iso, weekday: formatDate(d, 'weekday', lang), day: formatDate(d, 'dayNum', lang), month: formatDate(d, 'month', lang) });
    }
    return out;
  });

  protected readonly canNext = computed(() => {
    switch (this.step()) {
      case 1:
        return this.picks().length > 0 && !!this.quote();
      case 2:
        return !!this.slot();
      default:
        return true;
    }
  });

  ngOnInit(): void {
    const slug = this.store.slug();
    this.api.services(slug).subscribe({ next: (s) => this.services.set(s), error: (e) => this.fail(e) });
    this.api.me(slug).subscribe({
      next: (p) => {
        this.addresses.set(p.addresses);
        this.addressId.set(p.addresses.at(-1)?.id ?? null);
      },
    });
    this.quote$
      .pipe(
        debounceTime(200),
        switchMap(() => (this.items().length ? this.api.quote(slug, this.items()).pipe(catchError(() => of(null))) : of(null))),
      )
      .subscribe((q) => this.quote.set(q));
  }

  ngOnDestroy(): void {
    this.quote$.complete();
  }

  // --- step 1 ---
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
        : [...l, { service: s, quantity: s.pricingType === 'HOURLY' ? 3 : s.pricingType === 'PER_SQM' ? 100 : 1, addonIds: [] }],
    );
    this.changed();
  }

  setQty(p: Pick, q: number): void {
    p.quantity = Math.max(this.step1(p.service), Math.min(p.service.pricingType === 'PER_SQM' ? 5000 : 24, q));
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
  pickDate(iso: string): void {
    this.date.set(iso);
    this.slot.set(null);
    this.loadingSlots.set(true);
    this.api.availability(this.store.slug(), iso, this.items()).subscribe({
      next: (s) => {
        this.slots.set(s);
        this.loadingSlots.set(false);
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
    if (this.step() === 1 && !this.date()) {
      this.pickDate(this.days()[0].iso);
    }
    this.step.update((s) => Math.min(4, s + 1) as Step);
    window.scrollTo({ top: 0 });
  }

  back(): void {
    this.step.update((s) => Math.max(1, s - 1) as Step);
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
      })
      .subscribe({
        next: (b) => {
          this.busy.set(false);
          this.booked.set(b);
        },
        error: (e) => {
          this.busy.set(false);
          const code = (e?.error as { code?: string } | null)?.code;
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
