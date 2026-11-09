import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UIChart } from 'primeng/chart';
import { Tag } from 'primeng/tag';

import { LanguageService } from '../../core/i18n/language.service';
import { AnalyticsApi, AnalyticsQuery, DrillQuery, ServiceRow, growth } from './analytics.api';
import { MUTED, NEGATIVE, OTHER_COLOR, PALETTE, POSITIVE, alpha, baseOptions, countText, moneyAxis, moneyTooltip, pctText, sarCurrency, selectedIndex } from './charts';
import { loader } from './load';
import { KpiCard, StateBlock } from './widgets';

/** Name in the reader's language. */
export function serviceName(s: { name: string; nameEn?: string | null }, lang: string): string {
  return lang === 'en' && s.nameEn ? s.nameEn : s.name;
}

/** Service analytics: revenue, requests, distribution, comparison and (owner) profitability. */
@Component({
  selector: 'app-services-tab',
  imports: [TranslatePipe, UIChart, Tag, KpiCard, StateBlock],
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .85rem; margin-bottom: .85rem; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .85rem; margin-bottom: .85rem; }
    @media (max-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    h2 { font-size: 1rem; margin: 0 0 .25rem; }
    .sub { color: var(--fo-muted); font-size: .8rem; margin: 0 0 .75rem; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; min-width: 760px; }
    th { text-align: start; color: var(--fo-muted); font-weight: 600; padding: .5rem .4rem; border-bottom: 1px solid var(--fo-border); white-space: nowrap; }
    td { padding: .55rem .4rem; border-bottom: 1px solid var(--fo-border); }
    tr.row { cursor: pointer; } tr.row:hover td { background: #f8fafc; }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .up { color: #15803d; } .down { color: #b91c1c; }
    .bar { height: 5px; border-radius: 3px; background: var(--p-primary-400); margin-top: .3rem; }
    .tags { display: inline-flex; gap: .25rem; margin-inline-start: .4rem; flex-wrap: wrap; }
  `,
  template: `
    @let v = data.value();
    @if (v.state === 'error') {
      <div class="panel"><app-state kind="error" [message]="v.error" (retry)="data.reload()" /></div>
    } @else if (!v.data) {
      <div class="panel"><app-state kind="loading" /></div>
    } @else if (!v.data.services.length) {
      <div class="panel"><app-state kind="empty" /></div>
    } @else {
      @let d = v.data;
      <div class="kpis" [style.opacity]="v.state === 'loading' ? .6 : 1">
        @if (badges().topRevenue; as s) {
          <app-kpi icon="pi pi-star" [label]="'analytics.svc.topRevenue' | translate" [value]="nm(s)" [hint]="money(s.revenueHalalas) + ' · ' + pct(s.share)" [clickable]="true" (pick)="drillService(s, 'REVENUE')" />
        }
        @if (badges().mostRequested; as s) {
          <app-kpi icon="pi pi-inbox" [label]="'analytics.svc.mostRequested' | translate" [value]="nm(s)" [hint]="'analytics.nRequests' | translate: { n: s.requests }" [clickable]="true" (pick)="drillService(s, 'REQUESTS')" />
        }
        @if (badges().leastRequested; as s) {
          <app-kpi icon="pi pi-arrow-down" [label]="'analytics.svc.leastRequested' | translate" [value]="nm(s)" [hint]="'analytics.nRequests' | translate: { n: s.requests }" [clickable]="true" (pick)="drillService(s, 'REQUESTS')" />
        }
        @if (badges().mostProfitable; as s) {
          <app-kpi icon="pi pi-dollar" [label]="'analytics.svc.mostProfitable' | translate" [value]="nm(s)" [hint]="money(s.profitHalalas) + ' · ' + pct(s.margin)" />
        }
      </div>

      <div class="grid">
        <div class="panel">
          <h2>{{ 'analytics.svc.revenueBy' | translate }}</h2>
          <p class="sub">{{ 'analytics.clickToDrill' | translate }}</p>
          <p-chart type="bar" [data]="revenueChart()" [options]="revenueOptions()" [height]="chartHeight()" (onDataSelect)="onBar($event, 'REVENUE')" />
        </div>
        <div class="panel">
          <h2>{{ 'analytics.svc.requestsBy' | translate }}</h2>
          <p class="sub">{{ 'analytics.clickToDrill' | translate }}</p>
          <p-chart type="bar" [data]="requestsChart()" [options]="requestsOptions()" [height]="chartHeight()" (onDataSelect)="onBar($event, 'REQUESTS')" />
        </div>
      </div>

      <div class="grid">
        <div class="panel">
          <h2>{{ 'analytics.svc.distribution' | translate }}</h2>
          <p class="sub">{{ 'analytics.svc.distributionHint' | translate }}</p>
          <p-chart type="doughnut" [data]="shareChart()" [options]="donutOptions()" height="300px" (onDataSelect)="onShare($event)" />
        </div>
        @if (d.financials) {
          <div class="panel">
            <h2>{{ 'analytics.svc.profitBy' | translate }}</h2>
            <p class="sub">{{ 'analytics.svc.profitHint' | translate }}</p>
            @if (profitRows().length) {
              <p-chart type="bar" [data]="profitChart()" [options]="profitOptions()" height="300px" />
            } @else {
              <app-state kind="empty" [message]="'analytics.svc.noCosts' | translate" />
            }
          </div>
        }
      </div>

      <div class="panel">
        <h2>{{ 'analytics.svc.comparison' | translate }}</h2>
        <p class="sub">{{ 'analytics.svc.comparisonHint' | translate }}</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ 'analytics.service' | translate }}</th>
                <th class="num">{{ 'analytics.kpi.requests' | translate }}</th>
                <th class="num">{{ 'analytics.kpi.completed' | translate }}</th>
                <th class="num">{{ 'analytics.cancelRate' | translate }}</th>
                <th class="num">{{ 'analytics.revenue' | translate }}</th>
                <th class="num">{{ 'analytics.share' | translate }}</th>
                <th class="num">{{ 'analytics.change' | translate }}</th>
                @if (d.financials) {
                  <th class="num">{{ 'analytics.directCost' | translate }}</th>
                  <th class="num">{{ 'analytics.grossProfit' | translate }}</th>
                  <th class="num">{{ 'analytics.margin' | translate }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (s of d.services; track s.serviceId) {
                @let gr = g(s);
                <tr class="row" (click)="drillService(s, 'REQUESTS')">
                  <td>
                    {{ nm(s) }}
                    <span class="tags">
                      @if (s.serviceId === badges().topRevenue?.serviceId) { <p-tag severity="success" [value]="'analytics.svc.tagTop' | translate" /> }
                      @if (s.serviceId === badges().mostRequested?.serviceId) { <p-tag severity="info" [value]="'analytics.svc.tagPopular' | translate" /> }
                      @if (s.serviceId === badges().leastRequested?.serviceId) { <p-tag severity="warn" [value]="'analytics.svc.tagLow' | translate" /> }
                      @if (!s.active) { <p-tag severity="secondary" [value]="'common.inactive' | translate" /> }
                    </span>
                    <div class="bar" [style.width.%]="barWidth(s.revenueHalalas)"></div>
                  </td>
                  <td class="num">{{ count(s.requests) }}</td>
                  <td class="num">{{ count(s.completed) }}</td>
                  <td class="num">{{ s.requests ? pct(s.cancelled / s.requests) : '—' }}</td>
                  <td class="num"><span class="ltr">{{ money(s.revenueHalalas) }}</span></td>
                  <td class="num">{{ pct(s.share) }}</td>
                  <td class="num" [class.up]="(gr ?? 0) > 0" [class.down]="(gr ?? 0) < 0"><span class="ltr">{{ signed(gr) }}</span></td>
                  @if (d.financials) {
                    <td class="num"><span class="ltr">{{ money(s.directCostHalalas) }}</span></td>
                    <td class="num" [class.down]="(s.profitHalalas ?? 0) < 0"><span class="ltr">{{ money(s.profitHalalas) }}</span></td>
                    <td class="num">{{ pct(s.margin) }}</td>
                  }
                </tr>
              }
              @if (d.unassignedRevenueHalalas > 0) {
                <tr>
                  <td class="muted">{{ 'analytics.svc.unassigned' | translate }}</td>
                  <td class="num">—</td><td class="num">—</td><td class="num">—</td>
                  <td class="num"><span class="ltr">{{ money(d.unassignedRevenueHalalas) }}</span></td>
                  <td class="num">{{ pct(d.revenueHalalas ? d.unassignedRevenueHalalas / d.revenueHalalas : null) }}</td>
                  <td></td>
                  @if (d.financials) { <td></td><td></td><td></td> }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class ServicesTab {
  private readonly api = inject(AnalyticsApi);
  private readonly lang = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly query = input.required<AnalyticsQuery>();
  readonly drill = output<DrillQuery>();

  protected readonly data = loader(this.query, (q) => this.api.services(q));

  private readonly rows = computed(() => this.data.value().data?.services ?? []);
  /** Top 10 by revenue for the bar charts. */
  private readonly top = computed(() => this.rows().slice(0, 10));
  protected readonly chartHeight = computed(() => `${Math.max(220, this.top().length * 34 + 70)}px`);

  protected readonly badges = computed(() => {
    const s = this.rows();
    const byRequests = [...s].sort((a, b) => b.requests - a.requests);
    const profitable = s.filter((x) => x.profitHalalas != null).sort((a, b) => (b.profitHalalas ?? 0) - (a.profitHalalas ?? 0));
    return {
      topRevenue: s.find((x) => x.revenueHalalas > 0) ?? null,
      mostRequested: byRequests[0]?.requests ? byRequests[0] : null,
      leastRequested: byRequests.length > 1 ? byRequests[byRequests.length - 1] : null,
      mostProfitable: profitable[0] ?? null,
    };
  });

  protected readonly profitRows = computed(() => this.rows().filter((s) => s.profitHalalas != null).slice(0, 10));

  protected nm(s: ServiceRow): string {
    return serviceName(s, this.lang.current());
  }

  protected money(h: number | null | undefined): string {
    return sarCurrency(h, this.lang.current());
  }

  protected count(n: number): string {
    return countText(n, this.lang.current());
  }

  protected pct(f: number | null | undefined): string {
    return pctText(f, this.lang.current());
  }

  protected signed(f: number | null): string {
    return pctText(f, this.lang.current(), true);
  }

  protected g(s: ServiceRow): number | null {
    return growth(s.revenueHalalas, s.previousRevenueHalalas);
  }

  protected barWidth(v: number): number {
    const max = Math.max(1, ...this.rows().map((s) => s.revenueHalalas));
    return Math.max(2, Math.round((v / max) * 100));
  }

  private t(k: string): string {
    return this.translate.instant(k);
  }

  protected readonly revenueChart = computed(() => {
    this.lang.current();
    const top = this.top();
    const sets: Record<string, unknown>[] = [
      { label: this.t('analytics.currentPeriod'), data: top.map((s) => s.revenueHalalas), backgroundColor: PALETTE[0], borderRadius: 4, barPercentage: 0.8 },
    ];
    if (this.query().compare !== 'NONE') {
      sets.push({ label: this.t('analytics.previousPeriod'), data: top.map((s) => s.previousRevenueHalalas), backgroundColor: alpha(MUTED, 0.5), borderRadius: 4, barPercentage: 0.8 });
    }
    return { labels: top.map((s) => this.nm(s)), datasets: sets };
  });

  protected readonly revenueOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, { indexAxis: 'y', scales: { x: { ...moneyAxis(lang), grid: { color: '#eef2f6', display: true } }, y: { grid: { display: false } } }, plugins: { tooltip: moneyTooltip(lang) } });
  });

  protected readonly requestsChart = computed(() => {
    this.lang.current();
    const top = [...this.top()].sort((a, b) => b.requests - a.requests);
    return {
      labels: top.map((s) => this.nm(s)),
      datasets: [
        { label: this.t('analytics.kpi.completed'), data: top.map((s) => s.completed), backgroundColor: POSITIVE, stack: 's', borderRadius: 3 },
        { label: this.t('analytics.open'), data: top.map((s) => Math.max(0, s.requests - s.completed - s.cancelled)), backgroundColor: alpha(PALETTE[0], 0.45), stack: 's', borderRadius: 3 },
        { label: this.t('analytics.cancelledNoShow'), data: top.map((s) => s.cancelled), backgroundColor: alpha(NEGATIVE, 0.75), stack: 's', borderRadius: 3 },
      ],
    };
  });

  protected readonly requestsOptions = computed(() =>
    baseOptions(this.lang.current(), { indexAxis: 'y', scales: { x: { stacked: true, grid: { color: '#eef2f6', display: true }, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } } }),
  );

  protected readonly shareChart = computed(() => {
    this.lang.current();
    const d = this.data.value().data;
    const rows = this.rows().filter((s) => s.revenueHalalas > 0);
    const main = rows.slice(0, 6);
    const rest = rows.slice(6).reduce((a, s) => a + s.revenueHalalas, 0) + (d?.unassignedRevenueHalalas ?? 0);
    const labels = main.map((s) => this.nm(s));
    const values = main.map((s) => s.revenueHalalas);
    const colors = main.map((_, i) => PALETTE[i % PALETTE.length]);
    if (rest > 0) {
      labels.push(this.t('analytics.other'));
      values.push(rest);
      colors.push(OTHER_COLOR);
    }
    return { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] };
  });

  protected readonly donutOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, {
      cutout: '60%',
      interaction: { mode: 'nearest', intersect: true },
      scales: { x: { display: false }, y: { display: false } },
      plugins: { tooltip: moneyTooltip(lang) },
    });
  });

  protected readonly profitChart = computed(() => {
    this.lang.current();
    const rows = this.profitRows();
    return {
      labels: rows.map((s) => this.nm(s)),
      datasets: [
        { label: this.t('analytics.revenue'), data: rows.map((s) => s.revenueHalalas), backgroundColor: alpha(PALETTE[0], 0.35), borderRadius: 4 },
        { label: this.t('analytics.directCost'), data: rows.map((s) => s.directCostHalalas ?? 0), backgroundColor: alpha(NEGATIVE, 0.6), borderRadius: 4 },
        { label: this.t('analytics.grossProfit'), data: rows.map((s) => s.profitHalalas ?? 0), backgroundColor: rows.map((s) => ((s.profitHalalas ?? 0) >= 0 ? POSITIVE : NEGATIVE)), borderRadius: 4 },
      ],
    };
  });

  protected readonly profitOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, { scales: { y: moneyAxis(lang) }, plugins: { tooltip: moneyTooltip(lang) } });
  });

  // ---- drill-down

  protected drillService(s: ServiceRow, kind: 'REVENUE' | 'REQUESTS'): void {
    this.drill.emit({ title: this.nm(s), kind, query: { ...this.query(), serviceId: s.serviceId } });
  }

  protected onBar(e: unknown, kind: 'REVENUE' | 'REQUESTS'): void {
    const sel = selectedIndex(e as never);
    if (!sel) return;
    const list = kind === 'REVENUE' ? this.top() : [...this.top()].sort((a, b) => b.requests - a.requests);
    const s = list[sel.index];
    if (!s) return;
    if (kind === 'REQUESTS') {
      const status = sel.dataset === 0 ? ['COMPLETED'] : sel.dataset === 2 ? ['CANCELLED', 'NO_SHOW'] : ['NEW', 'CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'];
      this.drill.emit({ title: this.nm(s), kind, query: { ...this.query(), serviceId: s.serviceId, status: status as never } });
    } else {
      this.drillService(s, kind);
    }
  }

  protected onShare(e: unknown): void {
    const sel = selectedIndex(e as never);
    const s = sel ? this.rows().filter((x) => x.revenueHalalas > 0)[sel.index] : null;
    if (s && sel!.index < 6) this.drillService(s, 'REVENUE');
  }
}
