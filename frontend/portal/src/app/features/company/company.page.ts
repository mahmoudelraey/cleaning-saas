import { Component, DOCUMENT, ElementRef, HostListener, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs';

import { PublicReviews, PublicStats, Service } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { LanguageService } from '../../core/language.service';
import { PortalApi } from '../../core/portal.api';
import { ServiceTextPipe } from '../../core/service-names';
import { socialLinks } from '../../core/socials';
import { ContactSection } from './contact-section';
import { GoogleReviews } from './google-reviews';
import { Stars } from './stars';

/**
 * The company's public page at {portal}/{slug}: a hero with a live cost estimator, the service cards with their
 * prices, how booking works, real reviews and contact us, all on one page (the header links scroll to
 * #services, #how, #reviews and #contact). Everything shown comes from the company's own data:
 * no made-up numbers, offers or testimonials.
 */
@Component({
  selector: 'pt-company',
  imports: [RouterLink, TranslatePipe, SarPipe, LocalDatePipe, Stars, GoogleReviews, ServiceTextPipe, ContactSection],
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
  protected readonly stats = signal<PublicStats | null>(null);

  /**
   * The three promises under the hero: the owner's own "what to expect" lines (Settings → public page), each as
   * "title - subtitle"; the standard three fill in when there are fewer.
   */
  protected readonly promiseTiles = computed(() => {
    this.lang.current(); // re-read the standard texts after a language switch
    const icons = ['pi-shield', 'pi-history', 'pi-user-plus'];
    const own = (this.page().promises ?? '')
      .split('\n')
      .map((l) => l.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
      .map((l) => {
        const [title, ...rest] = l.split(/\s+[-–|]\s+/);
        return { title, sub: rest.join(' - ') };
      });
    const defaults = [1, 2, 3].map((n) => ({
      title: this.translate.instant(`company.trust${n}`),
      sub: this.translate.instant(`company.trust${n}Sub`),
    }));
    return [0, 1, 2].map((i) => ({ icon: icons[i], ...(own[i] ?? defaults[i]) }));
  });

  /**
   * The stats band: only real numbers, and only the ones worth showing (a new company with two visits shows
   * no visit count). Hidden when fewer than two are left.
   */
  protected readonly statTiles = computed(() => {
    const s = this.stats();
    this.lang.current();
    if (!s) return [];
    const out: { value: string; label: string }[] = [];
    const n = (v: number) => new Intl.NumberFormat('en-US').format(v);
    if (s.completedVisits >= 10) {
      out.push({ value: `+${n(s.completedVisits)}`, label: this.translate.instant('company.statVisits') });
    }
    if (s.satisfactionPercent !== null && s.ratingCount >= 5) {
      out.push({ value: `${s.satisfactionPercent}%`, label: this.translate.instant('company.statSatisfaction') });
    }
    if (s.technicians > 0) {
      out.push({ value: n(s.technicians), label: this.translate.instant('company.statTechnicians') });
    }
    const founded = this.page().foundedYear;
    const years = founded ? new Date().getFullYear() - founded : 0;
    if (years >= 1) {
      out.push({ value: `+${years}`, label: this.translate.instant('company.statYears') });
    } else if (this.reviews()?.count) {
      out.push({ value: `${this.reviews()!.average}/5`, label: this.translate.instant('company.statRating') });
    }
    return out.length >= 2 ? out : [];
  });

  /** Service cards shown before "View all". */
  protected readonly cardsShown = 6;
  protected readonly allServices = signal(false);
  protected readonly shownServices = computed(() => {
    const s = this.services() ?? [];
    return this.allServices() ? s : s.slice(0, this.cardsShown);
  });

  protected readonly areas = computed(() =>
    (this.page().areas ?? '')
      .split(/[,،\n]+/)
      .map((a) => a.trim())
      .filter(Boolean),
  );
  protected readonly socials = computed(() => socialLinks(this.page()));
  protected readonly whatsappUrl = computed(() => {
    const n = this.page().whatsapp?.replace(/\D/g, '');
    if (!n) return null;
    const text = this.translate.instant('company.whatsappText', { name: this.store.name() });
    return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
  });
  protected readonly hasContact = computed(
    () => !!(this.company()?.phone || this.whatsappUrl() || this.company()?.address || this.page().hours || this.socials().length),
  );

  // --- Cost estimator: one service at a time, with its quantity and add-ons ---
  protected readonly estId = signal<string | null>(null);
  protected readonly estService = computed(() => {
    const list = this.services() ?? [];
    return list.find((s) => s.id === this.estId()) ?? list[0] ?? null;
  });
  protected readonly estQty = signal(1);
  protected readonly estAddons = signal<string[]>([]);
  /** Price from the server's quote when it answers; until then (or if it can't), worked out here. */
  private readonly serverTotal = signal<number | null>(null);
  protected readonly estTotal = computed(() => this.serverTotal() ?? this.localTotal());
  private readonly quote$ = new Subject<void>();

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

    // Whenever the estimate changes, ask the server for the exact price (VAT and rounding as the booking will be).
    effect(() => {
      this.estService();
      this.estQty();
      this.estAddons();
      this.serverTotal.set(null);
      this.quote$.next();
    });
  }

  ngOnInit(): void {
    // Header links glide to their section on this page (only here; other pages keep instant scrolling).
    this.document.documentElement.style.scrollBehavior = 'smooth';
    const slug = this.slug();
    this.api.services(slug).subscribe({ next: (s) => this.services.set(s), error: () => this.services.set([]) });
    this.api.reviews(slug).subscribe({
      next: (r) => {
        this.reviews.set(r);
        setTimeout(() => this.measure()); // once the cards are on screen
      },
      error: () => this.reviews.set(null),
    });
    this.startAutoplay();
    this.api.stats(slug).subscribe({ next: (s) => this.stats.set(s), error: () => this.stats.set(null) });
    this.quote$
      .pipe(
        debounceTime(250),
        switchMap(() => {
          const s = this.estService();
          if (!s) return of(null);
          const item = { serviceId: s.id, quantity: s.pricingType === 'FIXED' ? null : this.estQty(), addonIds: this.estAddons() };
          return this.api.quote(slug, [item]).pipe(catchError(() => of(null)));
        }),
      )
      .subscribe((q) => this.serverTotal.set(q ? q.subtotalHalalas : null));
  }

  // --- Reviews swiper ---------------------------------------------------------------------------
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
    this.autoplay = setInterval(() => {
      if (this.paused() || this.pageCount() < 2 || this.document.hidden) return;
      this.goTo(this.slide() >= this.pageCount() - 1 ? 0 : this.slide() + 1);
    }, 6000);
  }

  ngOnDestroy(): void {
    clearInterval(this.autoplay);
    this.document.documentElement.style.scrollBehavior = '';
    this.quote$.complete();
  }

  protected pickEstimate(s: Service): void {
    this.estId.set(s.id);
    this.estQty.set(this.defaultQty(s));
    this.estAddons.set([]);
  }

  protected changeQty(dir: 1 | -1): void {
    const s = this.estService();
    if (!s) return;
    const step = s.pricingType === 'PER_SQM' ? 10 : 1;
    const max = s.pricingType === 'PER_SQM' ? 5000 : 24;
    this.estQty.update((q) => Math.max(step, Math.min(max, q + dir * step)));
  }

  protected toggleAddon(id: string): void {
    this.estAddons.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }

  /** Query params that carry the estimate into the booking page. */
  protected readonly estParams = computed(() => {
    const s = this.estService();
    if (!s) return {};
    return {
      service: s.id,
      qty: s.pricingType === 'FIXED' ? undefined : this.estQty(),
      addons: this.estAddons().length ? this.estAddons().join(',') : undefined,
    };
  });

  private localTotal(): number {
    const s = this.estService();
    if (!s) return 0;
    const qty = s.pricingType === 'FIXED' ? 1 : this.estQty();
    const addons = s.addons.filter((a) => this.estAddons().includes(a.id)).reduce((sum, a) => sum + a.priceHalalas, 0);
    return s.basePriceHalalas * qty + addons;
  }

  private defaultQty(s: Service): number {
    return s.pricingType === 'HOURLY' ? 3 : s.pricingType === 'PER_SQM' ? 100 : 1;
  }

  protected addonName(a: { name: string; nameEn?: string }): string {
    return this.lang.current() === 'en' && a.nameEn ? a.nameEn : a.name;
  }

  protected duration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return this.translate.instant('company.minutes', { m });
    return m ? this.translate.instant('company.hoursMinutes', { h, m }) : this.translate.instant('company.hours', { h });
  }

  /** Two letters for a reviewer's avatar. */
  protected initials(name?: string | null): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '★';
    return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}.${parts[1][0]}`;
  }

  /** A fitting icon from the service's name (Arabic or English); a sparkle when nothing matches. */
  protected serviceIcon(s: Service): string {
    const n = `${s.name} ${s.nameEn ?? ''}`.toLowerCase();
    const rules: [RegExp, string][] = [
      [/سيار|car|auto/, 'pi-car'],
      [/مكتب|office|شرك|محل|shop|store/, 'pi-building'],
      [/كنب|سجاد|موكيت|مفروش|sofa|carpet|rug|ستائر|curtain/, 'pi-th-large'],
      [/مكيف|تكييف|ac\b|air ?con/, 'pi-sun'],
      [/خزان|tank|water|مياه/, 'pi-filter'],
      [/حشر|pest|مبيد|تعقيم|disinfect|steril/, 'pi-shield'],
      [/شق|بيت|منزل|فيلا|فلل|home|house|apartment|villa|flat/, 'pi-home'],
    ];
    return rules.find(([re]) => re.test(n))?.[1] ?? 'pi-sparkles';
  }
}
