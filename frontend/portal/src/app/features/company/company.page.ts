import { Component, DOCUMENT, ElementRef, HostListener, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PublicReviews, Service } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe } from '../../core/format';
import { LanguageService } from '../../core/language.service';
import { PortalApi } from '../../core/portal.api';
import { socialLinks } from '../../core/socials';
import { AboutSection } from './about-section';
import { ContactSection } from './contact-section';
import { GoogleReviews } from './google-reviews';
import { ServiceCard } from './service-card';
import { Stars } from './stars';

/**
 * The company's public page at {portal}/{slug}: a hero, the service cards with their
 * prices, how booking works, real reviews and contact us, all on one page (the header links scroll to
 * #services, #how, #reviews and #contact). Everything shown comes from the company's own data:
 * no made-up numbers, offers or testimonials.
 */
@Component({
  selector: 'pt-company',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, Stars, GoogleReviews, AboutSection, ContactSection, ServiceCard],
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


  /** Service cards shown here; "View all services" opens the services page with search and pages. */
  protected readonly cardsShown = 3;
  protected readonly shownServices = computed(() => (this.services() ?? []).slice(0, this.cardsShown));

  protected readonly areas = computed(() =>
    this.store.areas()
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
    () => !!(this.company()?.phone || this.whatsappUrl() || this.store.address() || this.store.hours() || this.socials().length),
  );

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
    this.api.services(slug).subscribe({ next: (s) => this.services.set(s), error: () => this.services.set([]) });
    this.api.reviews(slug).subscribe({
      next: (r) => {
        this.reviews.set(r);
        setTimeout(() => this.measure()); // once the cards are on screen
      },
      error: () => this.reviews.set(null),
    });
    this.startAutoplay();
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
  }

  /** Two letters for a reviewer's avatar. */
  protected initials(name?: string | null): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '★';
    return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}.${parts[1][0]}`;
  }
}
