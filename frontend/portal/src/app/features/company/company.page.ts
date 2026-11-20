import { Component, DOCUMENT, ElementRef, HostListener, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, debounceTime, switchMap, of, catchError } from 'rxjs';

import { Item, PublicReviews, Quote, Service } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { LanguageService } from '../../core/language.service';
import { PortalApi } from '../../core/portal.api';
import { defaultServiceImage } from '../../core/service-image';
import { ServiceTextPipe, quoteLine } from '../../core/service-names';
import { socialLinks } from '../../core/socials';
import { AboutSection } from './about-section/about-section';
import { ContactSection } from './contact-section/contact-section';
import { GoogleReviews } from './google-reviews/google-reviews';
import { Stars } from './stars/stars';

/** What the visitor picked in the price calculator. */
interface CalcPick {
  serviceId: string;
  optionId: string | null;
  quantity: number;
  addonIds: string[];
  promo: boolean;
}

/**
 * The company's public page at {portal}/{slug}: a hero whose tabs show the company's own services, the portal's
 * promises, a live price calculator built from the services' real sizes, quantities and add-ons (priced by the
 * server), how booking works, real reviews, contact us and about us. The header links scroll to #services, #how,
 * #reviews, #contact and #about. Everything shown comes from the company's own data: no made-up numbers, offers
 * or testimonials.
 */
@Component({
  selector: 'pt-company',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, SarPipe, ServiceTextPipe, Stars, GoogleReviews, AboutSection, ContactSection],
  styleUrl: './company.page.scss',
  templateUrl: './company.page.html',
})
export class CompanyPage implements OnInit, OnDestroy {
  protected readonly store = inject(CompanyStore);
  protected readonly lang = inject(LanguageService);
  private readonly api = inject(PortalApi);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);

  protected readonly slug = this.store.slug;
  protected readonly company = this.store.company;
  protected readonly page = computed(() => this.company()?.page ?? {});
  protected readonly services = signal<Service[] | null>(null);
  protected readonly reviews = signal<PublicReviews | null>(null);

  protected readonly socials = computed(() => socialLinks(this.page()));
  protected readonly whatsappUrl = computed(() => {
    const n = this.page().whatsapp?.replace(/\D/g, '');
    if (!n) return null;
    const text = this.translate.instant('company.whatsappText', { name: this.store.name() });
    return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
  });

  /** The #section in the address (from the header, the footer or an old /about or /contact link). */
  private scrolledToFragment = false;

  constructor() {
    // The router scrolls to #fragment before the sections exist (they wait for the company and its services),
    // so scroll once more when they are on screen.
    effect(() => {
      if (this.scrolledToFragment || !this.company() || this.services() === null) return;
      this.scrolledToFragment = true;
      const id = this.route.snapshot.fragment;
      if (id) setTimeout(() => this.document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    });
  }

  ngOnInit(): void {
    // Header links glide to their section on this page (only here; other pages keep instant scrolling).
    this.document.documentElement.style.scrollBehavior = 'smooth';
    const slug = this.slug();
    this.api.services(slug).subscribe({
      next: (s) => {
        this.services.set(s);
        if (s.length) this.chooseService(s[0]);
      },
      error: () => this.services.set([]),
    });
    this.api.reviews(slug).subscribe({
      next: (r) => {
        this.reviews.set(r);
        setTimeout(() => this.measure()); // once the cards are on screen
      },
      error: () => this.reviews.set(null),
    });
    this.quotes$
      .pipe(
        debounceTime(200),
        switchMap((req) => (req ? this.api.quote(slug, [req.item], req.promo).pipe(catchError(() => of(null))) : of(null))),
      )
      .subscribe((q) => {
        this.quote.set(q);
        this.quoting.set(false);
      });
    this.startAutoplay();
  }

  ngOnDestroy(): void {
    clearInterval(this.autoplay);
    clearInterval(this.heroTimer);
    this.document.documentElement.style.scrollBehavior = '';
  }

  // --- Hero: the company's first services as tabs that change the picture ----------------------------------
  /** At most three services in the hero tabs. */
  protected readonly heroServices = computed(() => (this.services() ?? []).slice(0, 3));
  protected readonly heroIndex = signal(0);
  protected readonly heroService = computed(() => this.heroServices()[this.heroIndex()] ?? null);
  /** Progress of the active tab towards the next one (0-100). */
  protected readonly heroProgress = signal(0);
  protected readonly heroPaused = signal(false);
  private heroTimer?: ReturnType<typeof setInterval>;
  private static readonly SLIDE_MS = 7000;
  private static readonly TICK_MS = 70;

  protected heroImage(s: Service | null): string {
    if (!s) return 'hero/cleaning-pro.jpg';
    return s.imageUrl || defaultServiceImage(s.name, s.nameEn);
  }

  protected imageFailed(e: Event, s: Service | null): void {
    const img = e.target as HTMLImageElement;
    const fallback = s ? defaultServiceImage(s.name, s.nameEn) : 'hero/cleaning-pro.jpg';
    if (!img.src.endsWith(fallback)) img.src = fallback;
  }

  protected goToSlide(i: number): void {
    const n = this.heroServices().length;
    if (!n) return;
    this.heroIndex.set(((i % n) + n) % n);
    this.heroProgress.set(0);
  }

  // --- Price calculator --------------------------------------------------------------------------------------
  protected readonly pick = signal<CalcPick | null>(null);
  protected readonly calcService = computed(() => this.services()?.find((s) => s.id === this.pick()?.serviceId) ?? null);
  protected readonly quote = signal<Quote | null>(null);
  protected readonly quoting = signal(false);
  private readonly quotes$ = new Subject<{ item: Item; promo: string | null } | null>();
  /** Service cards in the calculator; "View all services" opens the services page with search and pages. */
  protected readonly cardsShown = 6;
  protected readonly calcServices = computed(() => {
    const first = (this.services() ?? []).slice(0, this.cardsShown);
    // A service opened from the hero slider stays visible as a card even when it is not among the first ones.
    const picked = this.calcService();
    return picked && !first.includes(picked) ? [...first.slice(0, this.cardsShown - 1), picked] : first;
  });

  /** "Starts from": the cheapest option when the service has options, otherwise its price. */
  protected fromPrice(s: Service): number {
    return s.options?.length ? Math.min(...s.options.map((o) => o.priceHalalas)) : s.basePriceHalalas;
  }

  /** Steps of the calculator in order, so their numbers follow what this service needs. */
  protected readonly steps = computed(() => {
    const s = this.calcService();
    const list: ('service' | 'size' | 'qty' | 'addons')[] = ['service'];
    if (s?.options?.length) list.push('size');
    else if (s && s.pricingType !== 'FIXED') list.push('qty');
    if (s?.addons?.length || this.company()?.announcement) list.push('addons');
    return list;
  });
  protected stepNo(step: 'service' | 'size' | 'qty' | 'addons'): number {
    return this.steps().indexOf(step) + 1;
  }

  /** Range of the quantity slider: hours (1-12) or square metres (20-1000, by 10). */
  protected readonly qtyRange = computed(() =>
    this.calcService()?.pricingType === 'PER_SQM' ? { min: 20, max: 1000, step: 10 } : { min: 1, max: 12, step: 1 },
  );

  /** From the hero slider: selects the service in the price calculator and scrolls to it. */
  protected openInCalculator(s: Service | null): void {
    if (!s) return;
    if (this.pick()?.serviceId !== s.id) this.chooseService(s);
    this.document.getElementById('services')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected chooseService(s: Service): void {
    const prev = this.pick();
    this.pick.set({
      serviceId: s.id,
      optionId: s.options?.length ? s.options[0].id : null,
      quantity: s.pricingType === 'PER_SQM' ? 100 : s.pricingType === 'HOURLY' ? 3 : 1,
      addonIds: [],
      promo: prev?.promo ?? false,
    });
    this.requote();
  }

  protected chooseOption(id: string): void {
    this.update({ optionId: id });
  }

  protected setQuantity(value: string | number): void {
    const r = this.qtyRange();
    this.update({ quantity: Math.max(r.min, Math.min(r.max, Number(value) || r.min)) });
  }

  protected toggleAddon(id: string): void {
    const p = this.pick();
    if (!p) return;
    this.update({ addonIds: p.addonIds.includes(id) ? p.addonIds.filter((a) => a !== id) : [...p.addonIds, id] });
  }

  protected togglePromo(): void {
    this.update({ promo: !this.pick()?.promo });
  }

  private update(change: Partial<CalcPick>): void {
    const p = this.pick();
    if (!p) return;
    this.pick.set({ ...p, ...change });
    this.requote();
  }

  private requote(): void {
    const p = this.pick();
    const s = this.calcService();
    if (!p || !s) {
      this.quotes$.next(null);
      return;
    }
    this.quoting.set(true);
    const code = p.promo ? this.company()?.announcement?.code ?? null : null;
    this.quotes$.next({
      item: { serviceId: s.id, optionId: p.optionId, quantity: s.pricingType === 'FIXED' ? null : p.quantity, addonIds: p.addonIds },
      promo: code,
    });
  }

  /** Quote lines in the visitor's language. */
  protected readonly quoteLines = computed(() => {
    const q = this.quote();
    const services = this.services() ?? [];
    this.lang.current();
    return (q?.items ?? []).map((it) => ({ text: quoteLine(it, services, this.lang.current()), total: it.totalHalalas }));
  });

  /** What is left to pay before VAT (subtotal − promo). */
  protected readonly calcNet = computed(() => {
    const q = this.quote();
    return q ? q.totalHalalas ?? q.subtotalHalalas : 0;
  });
  /** VAT: included in the prices, added on top, or none (company not registered). */
  protected readonly vat = computed(() => {
    const c = this.company();
    const net = this.calcNet();
    if (!c?.vatRegistered || !net) return null;
    return c.pricesIncludeVat
      ? { included: true, amount: Math.round(net - net / 1.15) }
      : { included: false, amount: Math.round(net * 0.15) };
  });
  protected readonly calcTotal = computed(() => {
    const v = this.vat();
    return this.calcNet() + (v && !v.included ? v.amount : 0);
  });

  /** Booking opens with the same service, size, quantity, add-ons and promo code. */
  protected readonly bookParams = computed(() => {
    const p = this.pick();
    const s = this.calcService();
    if (!p || !s) return {};
    const params: Record<string, string> = { service: s.id };
    if (p.optionId) params['option'] = p.optionId;
    if (s.pricingType !== 'FIXED') params['qty'] = String(p.quantity);
    if (p.addonIds.length) params['addons'] = p.addonIds.join(',');
    const code = this.company()?.announcement?.code;
    if (p.promo && code && this.quote()?.promo) params['promo'] = code;
    return params;
  });

  protected duration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return this.translate.instant('company.minutes', { m });
    return m ? this.translate.instant('company.hoursMinutes', { h, m }) : this.translate.instant('company.hours', { h });
  }

  // --- Reviews swiper ---------------------------------------------------------------------------------------
  private readonly track = viewChild<ElementRef<HTMLUListElement>>('track');
  /** Cards visible at once (3 / 2 / 1 by width), measured from the track. */
  private readonly perView = signal(1);
  protected readonly slide = signal(0);
  protected readonly paused = signal(false);
  protected readonly pageCount = computed(() => Math.ceil((this.reviews()?.items.length ?? 0) / this.perView()));
  protected readonly pages = computed(() => Array.from({ length: this.pageCount() }, (_, i) => i));
  private autoplay?: ReturnType<typeof setInterval>;

  /** Which page is in view; scrollLeft is negative in right-to-left pages, so its size is what counts. */
  protected onTrackScroll(): void {
    const el = this.track()?.nativeElement;
    if (!el) return;
    this.measure();
    const pos = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    const p = max - pos < 4 ? this.pageCount() - 1 : Math.round(pos / el.clientWidth);
    this.slide.set(Math.max(0, Math.min(this.pageCount() - 1, p)));
  }

  protected goTo(p: number): void {
    const el = this.track()?.nativeElement;
    const first = el?.children.item(p * this.perView()) as HTMLElement | null;
    if (!el || !first) return;
    // Scroll the track only (scrollIntoView would also move the page).
    const offset = first.offsetLeft - (el.firstElementChild as HTMLElement).offsetLeft;
    el.scrollTo({ left: offset, behavior: this.reducedMotion() ? 'auto' : 'smooth' });
    this.slide.set(p);
  }

  protected step(dir: 1 | -1): void {
    this.goTo(Math.max(0, Math.min(this.pageCount() - 1, this.slide() + dir)));
  }

  @HostListener('window:resize')
  protected measure(): void {
    const el = this.track()?.nativeElement;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    this.perView.set(Math.max(1, Math.round(el.clientWidth / card.offsetWidth)));
  }

  private reducedMotion(): boolean {
    return this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  private startAutoplay(): void {
    if (this.reducedMotion()) return;
    // Reviews: next group every 6 s until hovered or focused.
    this.autoplay = setInterval(() => {
      if (this.paused() || this.pageCount() < 2 || this.document.hidden) return;
      this.goTo(this.slide() >= this.pageCount() - 1 ? 0 : this.slide() + 1);
    }, 6000);
    // Hero tabs: the active tab fills up, then the next service shows (paused while hovered).
    this.heroTimer = setInterval(() => {
      if (this.heroPaused() || this.heroServices().length < 2 || this.document.hidden) return;
      const next = this.heroProgress() + (CompanyPage.TICK_MS / CompanyPage.SLIDE_MS) * 100;
      if (next >= 100) this.goToSlide(this.heroIndex() + 1);
      else this.heroProgress.set(next);
    }, CompanyPage.TICK_MS);
  }

  /** Two letters for a reviewer's avatar. */
  protected initials(name?: string | null): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '★';
    return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}.${parts[1][0]}`;
  }
}
