import { Component, computed, inject, input } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { PublicReviews } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';

/**
 * "About us" as a section of the company page (#about): the company's story, a few facts it gave, what customers
 * can expect, and where and when it works. Only what the company filled in is shown.
 */
@Component({
  selector: 'pt-about-section',
  imports: [TranslatePipe],
  styleUrls: ['./public-section.scss'],
  styles: `
    .about-grid { display: grid; gap: 28px; align-items: start; }
    @media (min-width: 960px) { .about-grid { grid-template-columns: 1.4fr 1fr; } }

    .story { margin: 0; font-size: 1.02rem; line-height: 2; color: #334155; white-space: pre-line; }
    .story.empty { color: var(--slate-5); }

    .promises { margin: 24px 0 0; padding: 22px 0 0; border-top: 1px solid #f1f5f9; }
    .promises ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    .promises h4 { margin: 0 0 14px; font-size: .95rem; font-weight: 800; color: #0f172a; }
    .promises li { display: flex; gap: 10px; align-items: flex-start; font-size: .92rem; font-weight: 600; color: #475569; }
    .promises i { color: var(--b500); margin-top: 4px; }

    .side { display: flex; flex-direction: column; gap: 20px; }

    /* Facts as tiles: big number, small label. */
    .facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin: 0; }
    .fact { padding: 20px; border-radius: 20px; background: #fff; border: 1px solid rgba(226, 232, 240, .8);
            box-shadow: 0 4px 6px -1px rgba(15, 23, 42, .06); transition: box-shadow .3s, transform .3s; }
    .fact:hover { box-shadow: var(--lift); transform: translateY(-2px); }
    .fact i { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; background: var(--b50);
              color: var(--b600); margin-bottom: 12px; }
    .fact dd { margin: 0; font-size: 1.45rem; font-weight: 900; color: var(--b600); line-height: 1.3; }
    .fact dt { font-size: .78rem; font-weight: 700; color: var(--slate-5); }

    .where h4 { margin: 0 0 12px; font-size: .95rem; font-weight: 800; color: #0f172a; }
    .hours { display: flex; align-items: center; gap: 8px; margin: 16px 0 0; color: #475569; font-weight: 600; font-size: .9rem; }
    .hours i { color: var(--b500); }
  `,
  template: `
    @if (company(); as c) {
      <section class="band" aria-labelledby="h-about">
        <div class="wrap">
          <header class="sec-head">
            <span class="kicker">{{ 'company.aboutUs' | translate }}</span>
            <h2 id="h-about">{{ 'company.about' | translate: { name: c.name } }}</h2>
            @if (page().headline) { <p>{{ page().headline }}</p> }
          </header>

          <div class="about-grid">
            <div class="panel">
              <div class="panel-head">
                <span class="p-ico"><i class="pi pi-book" aria-hidden="true"></i></span>
                <h3>{{ 'about.story' | translate }}</h3>
              </div>
              @if (page().about) {
                <p class="story">{{ page().about }}</p>
              } @else {
                <p class="story empty">{{ 'about.noStory' | translate: { name: c.name } }}</p>
              }
              @if (promises().length) {
                <div class="promises">
                  <h4>{{ 'about.expect' | translate }}</h4>
                  <ul>
                    @for (p of promises(); track p) {
                      <li><i class="pi pi-check-circle" aria-hidden="true"></i><span>{{ p }}</span></li>
                    }
                  </ul>
                </div>
              }
            </div>

            <div class="side">
              @if (facts().length) {
                <dl class="facts">
                  @for (f of facts(); track f.label) {
                    <div class="fact">
                      <i class="pi" [class]="f.icon" aria-hidden="true"></i>
                      <dd class="tnum">{{ f.value }}</dd>
                      <dt>{{ f.label }}</dt>
                    </div>
                  }
                </dl>
              }
              @if (areas().length || page().hours) {
                <div class="panel where">
                  <h4>{{ 'about.where' | translate }}</h4>
                  @if (areas().length) {
                    <ul class="tags">@for (a of areas(); track a) { <li>{{ a }}</li> }</ul>
                  }
                  @if (page().hours) {
                    <p class="hours"><i class="pi pi-clock" aria-hidden="true"></i>{{ page().hours }}</p>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </section>
    }
  `,
})
export class AboutSection {
  private readonly store = inject(CompanyStore);
  private readonly translate = inject(TranslateService);

  /** The portal ratings, already loaded by the company page. */
  readonly reviews = input<PublicReviews | null>(null);

  protected readonly company = this.store.company;
  protected readonly page = computed(() => this.company()?.page ?? {});
  protected readonly areas = computed(() =>
    (this.page().areas ?? '').split(/[,،\n]+/).map((a) => a.trim()).filter(Boolean),
  );
  protected readonly promises = computed(() =>
    (this.page().promises ?? '').split('\n').map((p) => p.replace(/^[-•*]\s*/, '').trim()).filter(Boolean),
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
