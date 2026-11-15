import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UIChart } from 'primeng/chart';

import { BookingStatus } from '../../../core/api.types';
import { LanguageService } from '../../../core/i18n/language.service';
import { AnalyticsApi, AnalyticsQuery, DrillQuery, Kpis, Point, growth } from '../analytics.api';
import {
  MUTED, NEGATIVE, PALETTE, POSITIVE, STATUS_COLORS, alpha, baseOptions, bucketLabel, countText, moneyAxis, moneyTooltip,
  pctText, sarCurrency, selectedIndex,
} from '../charts';
import { loader } from '../load';
import { KpiCard, StateBlock } from '../widgets/widgets';

const PENDING: BookingStatus[] = ['NEW', 'CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'];

/** Business performance: KPIs, revenue and request trends, statuses and plain-language insights. */
@Component({
  selector: 'app-overview-tab',
  imports: [TranslatePipe, UIChart, KpiCard, StateBlock],
  styleUrl: './overview.tab.scss',
  templateUrl: './overview.tab.html',
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
