import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UIChart } from 'primeng/chart';
import { Tag } from 'primeng/tag';

import { LanguageService } from '../../../core/i18n/language.service';
import { AnalyticsApi, AnalyticsQuery, DrillQuery, ServiceRow, growth } from '../analytics.api';
import { MUTED, NEGATIVE, OTHER_COLOR, PALETTE, POSITIVE, alpha, baseOptions, countText, moneyAxis, moneyTooltip, pctText, sarCurrency, selectedIndex } from '../charts';
import { loader } from '../load';
import { KpiCard, StateBlock } from '../widgets/widgets';

/** Name in the reader's language. */
export function serviceName(s: { name: string; nameEn?: string | null }, lang: string): string {
  return lang === 'en' && s.nameEn ? s.nameEn : s.name;
}

/** Service analytics: revenue, requests, distribution, comparison and (owner) profitability. */
@Component({
  selector: 'app-services-tab',
  imports: [TranslatePipe, UIChart, Tag, KpiCard, StateBlock],
  styleUrl: './services.tab.scss',
  templateUrl: './services.tab.html',
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
