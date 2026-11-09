import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { ReportSummary } from '../../core/api.types';
import { LanguageService } from '../../core/i18n/language.service';
import { AnalyticsQuery } from './analytics.api';
import { countText, sarCurrency } from './charts';
import { loader } from './load';
import { StateBlock } from './widgets';

/** Technician performance for the period (the existing reports summary API). */
@Component({
  selector: 'app-team-tab',
  imports: [TranslatePipe, StateBlock],
  styles: `
    h2 { font-size: 1rem; margin: 0 0 .25rem; }
    .sub { color: var(--fo-muted); font-size: .8rem; margin: 0 0 .75rem; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .92rem; min-width: 560px; }
    th { text-align: start; color: var(--fo-muted); font-weight: 600; padding: .45rem .3rem; border-bottom: 1px solid var(--fo-border); }
    td { padding: .55rem .3rem; border-bottom: 1px solid var(--fo-border); }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-inline-end: .45rem; }
    .bar { height: 5px; border-radius: 3px; margin-top: .3rem; }
  `,
  template: `
    <div class="panel">
      <h2>{{ 'reports.technicians' | translate }}</h2>
      <p class="sub">{{ 'analytics.team.hint' | translate }}</p>
      @let v = data.value();
      @if (v.state === 'error') {
        <app-state kind="error" [message]="v.error" (retry)="data.reload()" />
      } @else if (!v.data) {
        <app-state kind="loading" />
      } @else if (!v.data.technicians.length) {
        <app-state kind="empty" />
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ 'nav.technicians' | translate }}</th>
                <th class="num">{{ 'reports.done' | translate }}</th>
                <th class="num">{{ 'analytics.team.completion' | translate }}</th>
                <th class="num">{{ 'reports.hours' | translate }}</th>
                <th class="num">{{ 'reports.revenue' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (t of v.data.technicians; track t.technicianId) {
                <tr>
                  <td>
                    <span class="dot" [style.background]="t.color"></span>{{ t.name }}
                    @if (t.noShow) { <small class="muted"> · {{ 'reports.noShows' | translate: { n: t.noShow } }}</small> }
                    <div class="bar" [style.background]="t.color" [style.width.%]="share(t.completedValueHalalas)"></div>
                  </td>
                  <td class="num"><span class="ltr">{{ t.completed }} / {{ t.visits }}</span></td>
                  <td class="num">{{ t.visits ? round((t.completed / t.visits) * 100) + '%' : '—' }}</td>
                  <td class="num">{{ t.hours }}</td>
                  <td class="num"><span class="ltr">{{ money(t.completedValueHalalas) }}</span></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class TeamTab {
  private readonly http = inject(HttpClient);
  private readonly lang = inject(LanguageService);

  readonly query = input.required<AnalyticsQuery>();
  /** The summary covers at most a year: longer ranges show the last 366 days. */
  private readonly range = computed(() => {
    const q = this.query();
    const to = new Date(q.to + 'T00:00:00');
    const min = new Date(to);
    min.setDate(min.getDate() - 365);
    const from = new Date(q.from + 'T00:00:00') < min ? min : new Date(q.from + 'T00:00:00');
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: iso(from), to: q.to };
  });
  protected readonly data = loader(this.range, (r) => this.http.get<ReportSummary>('/api/v1/reports/summary', { params: r }));

  protected money(h: number): string {
    return sarCurrency(h, this.lang.current());
  }

  protected count(n: number): string {
    return countText(n, this.lang.current());
  }

  protected round(n: number): number {
    return Math.round(n);
  }

  protected share(v: number): number {
    const max = Math.max(1, ...(this.data.value().data?.technicians ?? []).map((t) => t.completedValueHalalas));
    return Math.max(2, Math.round((v / max) * 100));
  }
}
