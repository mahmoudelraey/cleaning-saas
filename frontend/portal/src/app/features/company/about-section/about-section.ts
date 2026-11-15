import { Component, computed, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PublicReviews } from '../../../core/api.types';
import { CompanyStore } from '../../../core/company.store';

/**
 * "About us" as a section of the company page (#about): the company's story, a few facts it gave, what customers
 * can expect, and where and when it works. Only what the company filled in is shown.
 */
@Component({
  selector: 'pt-about-section',
  imports: [TranslatePipe],
  styleUrls: ['../public-section.scss', './about-section.scss'],
  templateUrl: './about-section.html',
})
export class AboutSection {
  protected readonly store = inject(CompanyStore);
  private readonly translate = inject(TranslateService);

  /** The portal ratings, already loaded by the company page. */
  readonly reviews = input<PublicReviews | null>(null);

  protected readonly company = this.store.company;
  protected readonly page = computed(() => this.company()?.page ?? {});
  protected readonly areas = computed(() =>
    this.store.areas().split(/[,،\n]+/).map((a) => a.trim()).filter(Boolean),
  );
  /** Shown once the company wrote something about itself or gave a fact; otherwise the section stays out. */
  protected readonly hasContent = computed(() => !!this.store.about() || this.facts().length > 0 || this.promises().length > 0);

  protected readonly promises = computed(() =>
    this.store.promises().split('\n').map((p) => p.replace(/^[-•*]\s*/, '').trim()).filter(Boolean),
  );

  /** Only facts the company actually gave (or that its customers' ratings show). */
  protected readonly facts = computed(() => {
    const p = this.page();
    const out: { label: string; value: string; icon: string }[] = [];
    if (p.foundedYear) {
      const years = new Date().getFullYear() - p.foundedYear;
      out.push({
        label: this.translate.instant('about.since'),
        value: years >= 1 ? this.translate.instant('about.years', { n: years }) : String(p.foundedYear),
        icon: 'pi-calendar',
      });
    }
    if (p.teamSize) {
      out.push({ label: this.translate.instant('about.team'), value: this.translate.instant('about.people', { n: p.teamSize }), icon: 'pi-users' });
    }
    const r = this.reviews();
    if (r && r.count > 0) {
      out.push({ label: this.translate.instant('about.rating'), value: `${r.average} / 5`, icon: 'pi-star' });
    }
    if (this.areas().length) {
      out.push({ label: this.translate.instant('about.areasCount'), value: String(this.areas().length), icon: 'pi-map-marker' });
    }
    return out;
  });
}
