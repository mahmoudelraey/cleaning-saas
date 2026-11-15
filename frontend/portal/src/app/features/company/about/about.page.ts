import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PublicReviews } from '../../../core/api.types';
import { CompanyStore } from '../../../core/company.store';
import { PhonePipe } from '../../../core/format';
import { PortalApi } from '../../../core/portal.api';
import { SessionService } from '../../../core/session.service';

/** About us: the company's story, a few facts, what customers can expect, where and when they work. */
@Component({
  selector: 'pt-about',
  imports: [RouterLink, TranslatePipe, PhonePipe],
  styleUrls: ['../company.page.scss', './about.page.scss'],
  templateUrl: './about.page.html',
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
