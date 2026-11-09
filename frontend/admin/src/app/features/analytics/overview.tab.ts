import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UIChart } from 'primeng/chart';

import { BookingStatus } from '../../core/api.types';
import { LanguageService } from '../../core/i18n/language.service';
import { AnalyticsApi, AnalyticsQuery, DrillQuery, Kpis, Point, growth } from './analytics.api';
import {
  MUTED, NEGATIVE, PALETTE, POSITIVE, STATUS_COLORS, alpha, baseOptions, bucketLabel, countText, moneyAxis, moneyTooltip,
  pctText, sarCurrency, selectedIndex,
} from './charts';
import { loader } from './load';
import { KpiCard, StateBlock } from './widgets';

const PENDING: BookingStatus[] = ['NEW', 'CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'];

/** Business performance: KPIs, revenue and request trends, statuses and plain-language insights. */
@Component({
  selector: 'app-overview-tab',
  imports: [TranslatePipe, UIChart, KpiCard, StateBlock],
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: .85rem; margin-bottom: .85rem; }
    .grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: .85rem; margin-bottom: .85rem; }
    @media (max-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    h2 { font-size: 1rem; margin: 0 0 .25rem; }
    .sub { color: var(--fo-muted); font-size: .8rem; margin: 0 0 .75rem; }
    .insights { list-style: none; margin: 0; padding: 0; display: grid; gap: .6rem; }
    .insights li { display: flex; gap: .6rem; align-items: flex-start; line-height: 1.5; }
    .insights i { margin-top: .25rem; font-size: .85rem; }
    .insights .up { color: #16a34a; } .insights .down { color: #dc2626; } .insights .info { color: var(--p-primary-600); }
    .note { font-size: .8rem; color: var(--fo-muted); margin-top: .5rem; }
  `,
  template: `
    @let o = overview.value();
    @if (o.state === 'error') {
      <div class="panel"><app-state kind="error" [message]="o.error" (retry)="overview.reload()" /></div>
    } @else if (!o.data) {
      <div class="panel"><app-state kind="loading" /></div>
    } @else {
      @let d = o.data;
      @let c = d.current;
      @let p = d.previous;
      <div class="kpis" [style.opacity]="o.state === 'loading' ? .6 : 1">
        <app-kpi icon="pi pi-wallet" [label]="'analytics.kpi.revenue' | translate" [value]="money(c.revenueHalalas)" [delta]="g(c.revenueHalalas, p?.revenueHalalas)"
                 [hint]="'analytics.kpi.revenueHint' | translate" [clickable]="true" (pick)="drillAll('REVENUE')" />
        @if (c.expensesHalalas !== null) {
          <app-kpi icon="pi pi-arrow-circle-up" [label]="'analytics.kpi.expenses' | translate" [value]="money(c.expensesHalalas)" [delta]="g(c.expensesHalalas, p?.expensesHalalas)" [invert]="true"
                   [hint]="'analytics.kpi.expensesHint' | translate: { s: money(c.salaryCostHalalas) }" />
          <app-kpi icon="pi pi-chart-line" [label]="'analytics.kpi.netProfit' | translate" [value]="money(c.netProfitHalalas)" [negative]="(c.netProfitHalalas ?? 0) < 0"
                   [delta]="g(c.netProfitHalalas, p?.netProfitHalalas)" [hint]="'analytics.kpi.margin' | translate: { m: pct(c.profitMargin) }" />
        }
        <app-kpi icon="pi pi-percentage" [label]="'analytics.kpi.growth' | translate" [value]="growthText(c, p)" [negative]="(g(c.revenueHalalas, p?.revenueHalalas) ?? 0) < 0"
                 [hint]="p ? ('analytics.kpi.growthHint' | translate: { v: money(p.revenueHalalas) }) : ('analytics.kpi.noCompare' | translate)" />
        <app-kpi icon="pi pi-inbox" [label]="'analytics.kpi.requests' | translate" [value]="count(c.requests)" [delta]="g(c.requests, p?.requests)"
                 [hint]="'analytics.kpi.customers' | translate: { n: c.customers }" [clickable]="true" (pick)="drillStatus('analytics.kpi.requests', [])" />
        <app-kpi icon="pi pi-check-circle" [label]="'analytics.kpi.completed' | translate" [value]="count(c.completed)" [delta]="g(c.completed, p?.completed)"
                 [hint]="'analytics.kpi.completionRate' | translate: { r: pct(c.completionRate) }" [clickable]="true" (pick)="drillStatus('analytics.kpi.completed', ['COMPLETED'])" />
        <app-kpi icon="pi pi-clock" [label]="'analytics.kpi.pending' | translate" [value]="count(c.pending)" [delta]="g(c.pending, p?.pending)"
                 [clickable]="true" (pick)="drillStatus('analytics.kpi.pending', pending)" />
        <app-kpi icon="pi pi-times-circle" [label]="'analytics.kpi.cancelled' | translate" [value]="count(c.cancelled)" [delta]="g(c.cancelled, p?.cancelled)" [invert]="true"
                 [hint]="'analytics.kpi.cancelRate' | translate: { r: pct(c.cancellationRate), n: c.noShow }" [clickable]="true" (pick)="drillStatus('analytics.kpi.cancelled', ['CANCELLED', 'NO_SHOW'])" />
        <app-kpi icon="pi pi-tag" [label]="'analytics.kpi.avgRevenue' | translate" [value]="money(c.avgRevenuePerRequestHalalas)" [delta]="g(c.avgRevenuePerRequestHalalas, p?.avgRevenuePerRequestHalalas)"
                 [hint]="'analytics.kpi.avgRevenueHint' | translate: { n: c.invoices }" />
        @if (c.collectedHalalas !== null) {
          <app-kpi icon="pi pi-money-bill" [label]="'analytics.kpi.collected' | translate" [value]="money(c.collectedHalalas)" [delta]="g(c.collectedHalalas, p?.collectedHalalas)"
                   [hint]="d.outstandingHalalas !== null ? ('analytics.kpi.outstanding' | translate: { v: money(d.outstandingHalalas) }) : null" />
        }
      </div>
      @if (d.narrowed && d.financials) {
        <p class="note"><i class="pi pi-info-circle"></i> {{ 'analytics.narrowedNote' | translate }}</p>
      }

      <div class="grid">
        <div class="panel">
          <h2>{{ 'analytics.revenueTrend' | translate }}</h2>
          <p class="sub">{{ 'analytics.clickToDrill' | translate }}</p>
          <p-chart type="line" [data]="revenueChart()" [options]="revenueOptions()" height="280px" (onDataSelect)="onTrend($event, 'REVENUE')" />
        </div>
        <div class="panel">
          <h2>{{ 'analytics.insights' | translate }}</h2>
          <p class="sub">{{ 'analytics.insightsHint' | translate }}</p>
          <ul class="insights">
            @for (i of insights(); track $index) {
              <li><i class="pi" [class]="i.icon + ' ' + i.tone"></i><span>{{ i.text }}</span></li>
            } @empty {
              <li class="muted">{{ 'analytics.noData' | translate }}</li>
            }
          </ul>
        </div>
      </div>

      <div class="grid">
        <div class="panel">
          <h2>{{ 'analytics.requestsTrend' | translate }}</h2>
          <p class="sub">{{ 'analytics.clickToDrill' | translate }}</p>
          <p-chart type="bar" [data]="requestsChart()" [options]="requestsOptions()" height="280px" (onDataSelect)="onTrend($event, 'REQUESTS')" />
        </div>
        <div class="panel">
          <h2>{{ 'analytics.statuses' | translate }}</h2>
          <p class="sub">{{ 'analytics.clickToDrill' | translate }}</p>
          @if (d.statuses.length) {
            <p-chart type="doughnut" [data]="statusChart()" [options]="donutOptions()" height="280px" (onDataSelect)="onStatus($event)" />
          } @else {
            <app-state kind="empty" />
          }
        </div>
      </div>
    }
  `,
})
export class OverviewTab {
  private readonly api = inject(AnalyticsApi);
  private readonly lang = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly query = input.required<AnalyticsQuery>();
  readonly drill = output<DrillQuery>();

  protected readonly pending = PENDING;
  protected readonly overview = loader(this.query, (q) => this.api.overview(q));
  private readonly services = loader(this.query, (q) => this.api.services(q));
  private readonly regions = loader(this.query, (q) => this.api.regions({ ...q, compare: 'NONE' }));

  protected money(h: number | null | undefined): string | null {
    return h == null ? null : sarCurrency(h, this.lang.current());
  }

  protected count(n: number): string {
    return countText(n, this.lang.current());
  }

  protected pct(f: number | null | undefined): string {
    return pctText(f, this.lang.current());
  }

  protected g(c: number | null | undefined, p: number | null | undefined): number | null {
    return growth(c, p);
  }

  protected growthText(c: Kpis, p: Kpis | null): string | null {
    const v = growth(c.revenueHalalas, p?.revenueHalalas);
    return v == null ? null : pctText(v, this.lang.current(), true);
  }

  // ---- charts

  private labels(points: Point[]): string[] {
    const d = this.overview.value().data;
    return points.map((p) => bucketLabel(p.start, d?.granularity ?? 'DAY', this.lang.current()));
  }

  protected readonly revenueChart = computed(() => {
    const d = this.overview.value().data;
    if (!d) return { labels: [], datasets: [] };
    this.lang.current();
    const t = (k: string) => this.translate.instant(k);
    const datasets: Record<string, unknown>[] = [
      {
        label: t('analytics.currentPeriod'),
        data: d.trend.map((p) => p.revenueHalalas),
        borderColor: PALETTE[0],
        backgroundColor: alpha(PALETTE[0], 0.12),
        fill: true,
        tension: 0.3,
        pointRadius: d.trend.length > 40 ? 0 : 3,
        pointHoverRadius: 5,
      },
    ];
    if (d.previousTrend.length) {
      datasets.push({
        label: t('analytics.previousPeriod'),
        data: d.trend.map((_, i) => d.previousTrend[i]?.revenueHalalas ?? null),
        borderColor: MUTED,
        borderDash: [5, 4],
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 0,
      });
    }
    return { labels: this.labels(d.trend), datasets };
  });

  protected readonly revenueOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, { scales: { y: moneyAxis(lang) }, plugins: { tooltip: moneyTooltip(lang) } });
  });

  protected readonly requestsChart = computed(() => {
    const d = this.overview.value().data;
    if (!d) return { labels: [], datasets: [] };
    this.lang.current();
    const t = (k: string) => this.translate.instant(k);
    const datasets: Record<string, unknown>[] = [
      { type: 'bar', label: t('analytics.kpi.completed'), data: d.trend.map((p) => p.completed), backgroundColor: POSITIVE, stack: 'r', borderRadius: 3 },
      { type: 'bar', label: t('analytics.open'), data: d.trend.map((p) => Math.max(0, p.requests - p.completed - p.cancelled)), backgroundColor: alpha(PALETTE[0], 0.45), stack: 'r', borderRadius: 3 },
      { type: 'bar', label: t('analytics.cancelledNoShow'), data: d.trend.map((p) => p.cancelled), backgroundColor: alpha(NEGATIVE, 0.75), stack: 'r', borderRadius: 3 },
    ];
    if (d.previousTrend.length) {
      datasets.push({
        type: 'line',
        label: t('analytics.previousPeriod'),
        data: d.trend.map((_, i) => d.previousTrend[i]?.requests ?? null),
        borderColor: MUTED,
        borderDash: [5, 4],
        pointRadius: 0,
        tension: 0.3,
      });
    }
    return { labels: this.labels(d.trend), datasets };
  });

  protected readonly requestsOptions = computed(() =>
    baseOptions(this.lang.current(), { scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } } }),
  );

  protected readonly statusChart = computed(() => {
    const d = this.overview.value().data;
    if (!d) return { labels: [], datasets: [] };
    this.lang.current();
    return {
      labels: d.statuses.map((s) => this.translate.instant('bookingStatus.' + s.status)),
      datasets: [{ data: d.statuses.map((s) => s.count), backgroundColor: d.statuses.map((s) => STATUS_COLORS[s.status] ?? MUTED), borderWidth: 2, borderColor: '#fff' }],
    };
  });

  protected readonly donutOptions = computed(() =>
    baseOptions(this.lang.current(), { cutout: '62%', interaction: { mode: 'nearest', intersect: true }, scales: { x: { display: false }, y: { display: false } } }),
  );

  // ---- insights: the questions management asks, answered from the data

  protected readonly insights = computed(() => {
    const d = this.overview.value().data;
    if (!d) return [];
    const lang = this.lang.current();
    const t = (k: string, p?: Record<string, unknown>) => this.translate.instant(k, p);
    const name = (ar: string, en: string | null) => (lang === 'en' && en ? en : ar);
    const out: { icon: string; tone: string; text: string }[] = [];
    const c = d.current;
    const p = d.previous;

    const rg = growth(c.revenueHalalas, p?.revenueHalalas);
    if (rg != null) {
      out.push(rg >= 0
        ? { icon: 'pi-arrow-up-right', tone: 'up', text: t('analytics.insight.growing', { g: pctText(rg, lang), v: sarCurrency(c.revenueHalalas, lang) }) }
        : { icon: 'pi-arrow-down-right', tone: 'down', text: t('analytics.insight.declining', { g: pctText(-rg, lang), v: sarCurrency(c.revenueHalalas, lang) }) });
    }
    if (c.netProfitHalalas != null) {
      out.push({
        icon: c.netProfitHalalas >= 0 ? 'pi-check' : 'pi-exclamation-triangle',
        tone: c.netProfitHalalas >= 0 ? 'up' : 'down',
        text: t(c.netProfitHalalas >= 0 ? 'analytics.insight.profit' : 'analytics.insight.loss', {
          v: sarCurrency(Math.abs(c.netProfitHalalas), lang), e: sarCurrency(c.expensesHalalas, lang), m: pctText(c.profitMargin, lang),
        }),
      });
    }

    const s = this.services.value().data?.services ?? [];
    if (s.length) {
      const top = s[0];
      out.push({ icon: 'pi-star', tone: 'info', text: t('analytics.insight.topService', { s: name(top.name, top.nameEn), v: sarCurrency(top.revenueHalalas, lang), p: pctText(top.share, lang) }) });
      const mostRequested = [...s].sort((a, b) => b.requests - a.requests)[0];
      if (mostRequested.serviceId !== top.serviceId) {
        out.push({ icon: 'pi-inbox', tone: 'info', text: t('analytics.insight.mostRequested', { s: name(mostRequested.name, mostRequested.nameEn), n: mostRequested.requests }) });
      }
      const profitable = s.filter((x) => x.profitHalalas != null).sort((a, b) => (b.profitHalalas ?? 0) - (a.profitHalalas ?? 0))[0];
      if (profitable) {
        out.push({ icon: 'pi-dollar', tone: 'up', text: t('analytics.insight.mostProfitable', { s: name(profitable.name, profitable.nameEn), v: sarCurrency(profitable.profitHalalas, lang), m: pctText(profitable.margin, lang) }) });
      }
      if (p) {
        const movers = s.filter((x) => x.previousRevenueHalalas > 0).map((x) => ({ x, g: growth(x.revenueHalalas, x.previousRevenueHalalas) ?? 0 }));
        const best = [...movers].sort((a, b) => b.g - a.g)[0];
        const worst = [...movers].sort((a, b) => a.g - b.g)[0];
        if (best && best.g > 0.05) out.push({ icon: 'pi-arrow-up', tone: 'up', text: t('analytics.insight.serviceUp', { s: name(best.x.name, best.x.nameEn), g: pctText(best.g, lang) }) });
        if (worst && worst.g < -0.05) out.push({ icon: 'pi-arrow-down', tone: 'down', text: t('analytics.insight.serviceDown', { s: name(worst.x.name, worst.x.nameEn), g: pctText(-worst.g, lang) }) });
      }
    }

    const r = (this.regions.value().data?.regions ?? []).filter((x) => x.regionId != null && x.requests > 0);
    if (r.length) {
      const top = r[0];
      out.push({ icon: 'pi-map-marker', tone: 'info', text: t('analytics.insight.topRegion', { r: name(top.nameAr, top.nameEn), n: top.requests, p: pctText(c.requests ? top.requests / c.requests : null, lang) }) });
      const byRevenue = [...r].sort((a, b) => b.revenueHalalas - a.revenueHalalas)[0];
      if (byRevenue.regionId !== top.regionId && byRevenue.revenueHalalas > 0) {
        out.push({ icon: 'pi-wallet', tone: 'info', text: t('analytics.insight.topRegionRevenue', { r: name(byRevenue.nameAr, byRevenue.nameEn), v: sarCurrency(byRevenue.revenueHalalas, lang) }) });
      }
      if (r.length > 1) {
        const low = r[r.length - 1];
        out.push({ icon: 'pi-compass', tone: 'info', text: t('analytics.insight.lowRegion', { r: name(low.nameAr, low.nameEn), n: low.requests }) });
      }
    }
    if (c.requests && c.cancellationRate >= 0.15) {
      out.push({ icon: 'pi-exclamation-circle', tone: 'down', text: t('analytics.insight.cancellations', { r: pctText(c.cancellationRate, lang) }) });
    }
    return out;
  });

  // ---- drill-down

  protected drillAll(kind: 'REVENUE' | 'REQUESTS'): void {
    this.drill.emit({ title: this.translate.instant(kind === 'REVENUE' ? 'analytics.kpi.revenue' : 'analytics.kpi.requests'), kind, query: this.query() });
  }

  protected drillStatus(titleKey: string, status: BookingStatus[]): void {
    const q = this.query();
    this.drill.emit({ title: this.translate.instant(titleKey), kind: 'REQUESTS', query: status.length ? { ...q, status } : q });
  }

  protected onTrend(e: unknown, kind: 'REVENUE' | 'REQUESTS'): void {
    const sel = selectedIndex(e as never);
    const d = this.overview.value().data;
    if (!sel || !d) return;
    // The dashed line is the comparison period: open its bucket instead.
    const isPrev = kind === 'REVENUE' ? sel.dataset === 1 : sel.dataset === 3;
    const point = isPrev ? d.previousTrend[sel.index] : d.trend[sel.index];
    if (!point) return;
    let q: AnalyticsQuery = { ...this.query(), from: point.start, to: point.end };
    if (kind === 'REQUESTS' && !isPrev) {
      if (sel.dataset === 0) q = { ...q, status: ['COMPLETED'] };
      if (sel.dataset === 2) q = { ...q, status: ['CANCELLED', 'NO_SHOW'] };
      if (sel.dataset === 1) q = { ...q, status: PENDING };
    }
    this.drill.emit({ title: bucketLabel(point.start, d.granularity, this.lang.current()), kind, query: q });
  }

  protected onStatus(e: unknown): void {
    const sel = selectedIndex(e as never);
    const s = sel ? this.overview.value().data?.statuses[sel.index] : null;
    if (s) this.drill.emit({ title: this.translate.instant('bookingStatus.' + s.status), kind: 'REQUESTS', query: { ...this.query(), status: [s.status] } });
  }
}
