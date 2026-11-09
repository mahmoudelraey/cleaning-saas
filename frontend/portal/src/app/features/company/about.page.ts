import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PublicReviews } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { PhonePipe } from '../../core/format';
import { PortalApi } from '../../core/portal.api';
import { SessionService } from '../../core/session.service';

/** About us: the company's story, a few facts, what customers can expect, where and when they work. */
@Component({
  selector: 'pt-about',
  imports: [RouterLink, TranslatePipe, PhonePipe],
  styleUrls: ['./company.page.scss', './about.page.scss'],
  template: `
    @if (company(); as c) {
      <section class="hero about-hero">
        <div class="hero-in">
          <p class="kicker">{{ 'company.aboutUs' | translate }}</p>
          <h1>{{ c.name }}</h1>
          @if (page().headline) { <p class="lead">{{ page().headline }}</p> }
        </div>
        <svg class="waterline" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,46 C180,86 340,8 560,34 C760,58 900,92 1110,58 C1260,34 1360,22 1440,30 L1440,90 L0,90 Z" />
        </svg>
      </section>

      <main class="content">
        @if (facts().length) {
          <dl class="facts-grid">
            @for (f of facts(); track f.label) {
              <div><dt>{{ f.label }}</dt><dd class="tnum">{{ f.value }}</dd></div>
            }
          </dl>
        }

        <section class="block" aria-labelledby="h-story">
          <h2 id="h-story">{{ 'about.story' | translate }}</h2>
          @if (page().about) {
            <p class="about story">{{ page().about }}</p>
          } @else {
            <p class="muted">{{ 'about.noStory' | translate: { name: c.name } }}</p>
          }
        </section>

        @if (promises().length) {
          <section class="block" aria-labelledby="h-promise">
            <h2 id="h-promise">{{ 'about.expect' | translate }}</h2>
            <ul class="promises">
              @for (p of promises(); track p) { <li><i class="pi pi-check" aria-hidden="true"></i><span>{{ p }}</span></li> }
            </ul>
          </section>
        }

        @if (areas().length || page().hours) {
          <section class="block" aria-labelledby="h-where">
            <h2 id="h-where">{{ 'about.where' | translate }}</h2>
            @if (areas().length) {
              <ul class="tags">@for (a of areas(); track a) { <li>{{ a }}</li> }</ul>
            }
            @if (page().hours) {
              <p class="hours"><i class="pi pi-clock"></i>{{ page().hours }}</p>
            }
          </section>
        }

        <section class="block cta-band">
          <h2>{{ 'about.ctaTitle' | translate }}</h2>
          <p class="muted">{{ 'about.ctaLead' | translate }}</p>
          <div class="cta-row">
            @if (c.bookingOpen) {
              <a class="btn btn-primary" [routerLink]="['/', slug(), 'book']"><i class="pi pi-calendar-plus"></i>{{ 'company.book' | translate }}</a>
            }
            @if (!signedIn()) {
              <a class="btn btn-quiet" [routerLink]="['/', slug(), 'register']">{{ 'register.title' | translate }}</a>
            }
            @if (page().whatsapp) {
              <a class="btn btn-quiet" [href]="'https://wa.me/' + page().whatsapp!.replace('+', '')" target="_blank" rel="noopener">
                <i class="pi pi-whatsapp"></i>{{ page().whatsapp | phone }}
              </a>
            } @else if (c.phone) {
              <a class="btn btn-quiet" [href]="'tel:' + c.phone"><i class="pi pi-phone"></i>{{ c.phone | phone }}</a>
            }
          </div>
        </section>
      </main>
    } @else {
      <div class="loading"><div class="spinner" aria-hidden="true"></div></div>
    }
  `,
})
export class AboutPage implements OnInit {
  private readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly sessions = inject(SessionService);
  private readonly translate = inject(TranslateService);

  protected readonly slug = this.store.slug;
  protected readonly company = this.store.company;
  protected readonly page = computed(() => this.company()?.page ?? {});
  protected readonly reviews = signal<PublicReviews | null>(null);
  protected readonly signedIn = computed(() => !!this.sessions.get(this.slug()));

  protected readonly areas = computed(() =>
    (this.page().areas ?? '').split(/[,،\n]+/).map((a) => a.trim()).filter(Boolean),
  );
  protected readonly promises = computed(() =>
    (this.page().promises ?? '').split('\n').map((p) => p.replace(/^[-•*]\s*/, '').trim()).filter(Boolean),
  );

  /** Only facts the company actually gave (or that its customers' ratings show). */
  protected readonly facts = computed(() => {
    const p = this.page();
    const out: { label: string; value: string }[] = [];
    if (p.foundedYear) {
      const years = new Date().getFullYear() - p.foundedYear;
      out.push({
        label: this.translate.instant('about.since'),
        value: years >= 1 ? this.translate.instant('about.years', { n: years }) : String(p.foundedYear),
      });
    }
    if (p.teamSize) {
      out.push({ label: this.translate.instant('about.team'), value: this.translate.instant('about.people', { n: p.teamSize }) });
    }
    const r = this.reviews();
    if (r && r.count > 0) {
      out.push({ label: this.translate.instant('about.rating'), value: `${r.average} / 5` });
    }
    if (this.areas().length) {
      out.push({ label: this.translate.instant('about.areasCount'), value: String(this.areas().length) });
    }
    return out;
  });

  ngOnInit(): void {
    this.api.reviews(this.slug()).subscribe({ next: (r) => this.reviews.set(r), error: () => {} });
  }
}
