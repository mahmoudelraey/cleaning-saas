import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Tag } from 'primeng/tag';

import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { SarPipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { PlatformApi, PlatformOverview, daysUntil } from './platform.api';

/** Platform console home: how many companies are on trial, paying, overdue or blocked, and what needs action. */
@Component({
  selector: 'app-platform-overview',
  imports: [TranslatePipe, RouterLink, Tag, SarPipe, LocalDatePipe],
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: .85rem; margin-bottom: 1rem; }
    a.kpi { display: grid; gap: .3rem; text-decoration: none; color: inherit; }
    a.kpi:hover { border-color: var(--p-primary-300); }
    .kpi span { color: var(--fo-muted); font-size: .85rem; }
    .kpi strong { font-size: 1.6rem; font-variant-numeric: tabular-nums; }
    .kpi.warn strong { color: #b45309; } .kpi.bad strong { color: #b91c1c; }
    .grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: .85rem; }
    @media (max-width: 900px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    h2 { font-size: 1rem; margin: 0 0 .75rem; }
    table { width: 100%; border-collapse: collapse; font-size: .92rem; }
    th { text-align: start; color: var(--fo-muted); font-weight: 600; padding: .4rem .3rem; border-bottom: 1px solid var(--fo-border); }
    td { padding: .5rem .3rem; border-bottom: 1px solid var(--fo-border); }
    .num { text-align: end; font-variant-numeric: tabular-nums; }
    .bar { height: 6px; border-radius: 3px; background: var(--p-primary-400); margin-top: .3rem; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'platform.overview.title' | translate }}</h1>
        <p>{{ 'platform.overview.subtitle' | translate }}</p>
      </div>
    </div>

    @if (data(); as d) {
      <div class="kpis">
        <a class="panel kpi" routerLink="/platform/companies"><span>{{ 'platform.overview.companies' | translate }}</span><strong>{{ d.companies }}</strong>
          <small class="muted">{{ 'platform.overview.newCompanies' | translate: { n: d.newLast30Days } }}</small></a>
        <a class="panel kpi" routerLink="/platform/companies" [queryParams]="{ status: 'ACTIVE' }"><span>{{ 'platform.overview.paying' | translate }}</span><strong>{{ d.active }}</strong>
          <small class="muted">{{ 'platform.overview.mrr' | translate }} <span class="ltr">{{ d.monthlyRecurringHalalas | sar }}</span></small></a>
        <a class="panel kpi" routerLink="/platform/companies" [queryParams]="{ status: 'TRIAL' }"><span>{{ 'platform.overview.trials' | translate }}</span><strong>{{ d.trials }}</strong></a>
        <a class="panel kpi warn" routerLink="/platform/companies" [queryParams]="{ status: 'ENDING_SOON' }"><span>{{ 'platform.overview.endingSoon' | translate }}</span><strong>{{ d.trialsEndingSoon }}</strong></a>
        <a class="panel kpi bad" routerLink="/platform/companies" [queryParams]="{ status: 'TRIAL_EXPIRED' }"><span>{{ 'platform.overview.trialsExpired' | translate }}</span><strong>{{ d.trialsExpired }}</strong></a>
        <a class="panel kpi warn" routerLink="/platform/companies" [queryParams]="{ status: 'PAST_DUE' }"><span>{{ 'platform.overview.pastDue' | translate }}</span><strong>{{ d.pastDue }}</strong></a>
        <a class="panel kpi bad" routerLink="/platform/companies" [queryParams]="{ status: 'SUSPENDED' }"><span>{{ 'platform.overview.suspended' | translate }}</span><strong>{{ d.suspended }}</strong></a>
      </div>

      <div class="grid">
        <div class="panel">
          <h2>{{ 'platform.overview.endingList' | translate }}</h2>
          @if (d.endingSoon.length) {
            <table>
              <thead><tr><th>{{ 'platform.company' | translate }}</th><th>{{ 'platform.owner' | translate }}</th><th>{{ 'platform.trialEnds' | translate }}</th><th></th></tr></thead>
              <tbody>
                @for (c of d.endingSoon; track c.id) {
                  <tr>
                    <td><a [routerLink]="['/platform/companies']" [queryParams]="{ open: c.id }">{{ c.name }}</a></td>
                    <td>{{ c.ownerName }}<div class="muted ltr">{{ c.ownerPhone }}</div></td>
                    <td>{{ c.trialEndsAt | ldate: 'mediumDate' }}</td>
                    <td><p-tag severity="warn" [value]="'platform.daysLeft' | translate: { n: days(c.trialEndsAt) }" /></td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="muted">{{ 'platform.overview.noneEnding' | translate }}</p>
          }
        </div>
        <div class="panel">
          <h2>{{ 'platform.overview.byPlan' | translate }}</h2>
          <table>
            <tbody>
              @for (p of d.byPlan; track p.planId) {
                <tr><td>{{ p.planId }}<div class="bar" [style.width.%]="share(p.companies)"></div></td><td class="num">{{ p.companies }}</td></tr>
              } @empty {
                <tr><td class="muted">{{ 'analytics.noData' | translate }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @else if (error()) {
      <div class="panel"><p class="muted">{{ error() }}</p></div>
    } @else {
      <div class="panel"><i class="pi pi-spin pi-spinner"></i></div>
    }
  `,
})
export class PlatformOverviewPage {
  private readonly api = inject(PlatformApi);
  private readonly translate = inject(TranslateService);
  protected readonly lang = inject(LanguageService);

  protected readonly data = signal<PlatformOverview | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.overview().subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.error.set(errorMessage(e, this.translate)),
    });
  }

  protected days(iso: string | null): number {
    return daysUntil(iso) ?? 0;
  }

  protected share(n: number): number {
    const max = Math.max(1, ...(this.data()?.byPlan ?? []).map((p) => p.companies));
    return Math.max(3, Math.round((n / max) * 100));
  }
}
