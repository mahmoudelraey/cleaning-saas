import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UIChart } from 'primeng/chart';
import { SelectButton } from 'primeng/selectbutton';

import { LanguageService } from '../../../core/i18n/language.service';
import { AnalyticsApi, AnalyticsQuery, CityRow, DrillQuery, RegionRow } from '../analytics.api';
import { OTHER_COLOR, PALETTE, alpha, baseOptions, countText, moneyAxis, moneyTooltip, pctText, sarCurrency, selectedIndex } from '../charts';
import { loader } from '../load';
import { serviceName } from '../services/services.tab';
import { RegionMap } from '../visuals/visuals';
import { KpiCard, StateBlock } from '../widgets/widgets';

/** Regional analytics: demand and revenue by region and city, service mix per region, map. */
@Component({
  selector: 'app-regions-tab',
  imports: [FormsModule, TranslatePipe, UIChart, SelectButton, RegionMap, KpiCard, StateBlock],
  styleUrl: './regions.tab.scss',
  templateUrl: './regions.tab.html',
})
export class RegionsTab {
  private readonly api = inject(AnalyticsApi);
  private readonly lang = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly query = input.required<AnalyticsQuery>();
  readonly drill = output<DrillQuery>();
  /** Narrow the whole dashboard to a region (click on the map). */
  readonly filter = output<Partial<AnalyticsQuery>>();

  protected readonly metric = signal<'requests' | 'revenue'>('requests');
  protected readonly data = loader(this.query, (q) => this.api.regions(q));

  protected readonly metrics = computed(() => {
    this.lang.current();
    return [
      { value: 'requests', label: this.translate.instant('analytics.kpi.requests') },
      { value: 'revenue', label: this.translate.instant('analytics.revenue') },
    ];
  });

  /** Regions with any activity, busiest first. */
  protected readonly active = computed(() =>
    (this.data.value().data?.regions ?? []).filter((r) => r.regionId != null && (r.requests > 0 || r.revenueHalalas > 0)),
  );
  protected readonly barsHeight = computed(() => `${Math.max(220, this.active().length * 34 + 70)}px`);

  protected readonly highlights = computed(() => {
    const all = (this.data.value().data?.regions ?? []).filter((r) => r.regionId != null);
    const a = this.active();
    const byRevenue = [...a].sort((x, y) => y.revenueHalalas - x.revenueHalalas)[0];
    return {
      byRequests: a[0] ?? null,
      byRevenue: byRevenue && byRevenue.revenueHalalas > 0 ? byRevenue : null,
      lowest: a.length > 1 ? a[a.length - 1] : null,
      active: a.length,
      total: all.length,
    };
  });

  protected rn(r: RegionRow): string {
    return this.lang.current() === 'en' ? r.nameEn : r.nameAr.replace(/^منطقة\s+/, '');
  }

  protected cn(c: CityRow): string {
    return this.lang.current() === 'en' ? c.nameEn : c.nameAr;
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

  protected cityBar(n: number): number {
    const max = Math.max(1, ...(this.data.value().data?.cities ?? []).map((c) => c.requests));
    return Math.max(2, Math.round((n / max) * 100));
  }

  protected readonly compareChart = computed(() => {
    this.lang.current();
    const a = this.active();
    return {
      labels: a.map((r) => this.rn(r)),
      datasets: [
        { label: this.translate.instant('analytics.kpi.requests'), data: a.map((r) => r.requests), backgroundColor: PALETTE[0], xAxisID: 'x', borderRadius: 4 },
        { label: this.translate.instant('analytics.revenue'), data: a.map((r) => r.revenueHalalas), backgroundColor: alpha(PALETTE[1], 0.85), xAxisID: 'x2', borderRadius: 4 },
      ],
    };
  });

  protected readonly compareOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, {
      indexAxis: 'y',
      scales: {
        x: { position: 'bottom', grid: { color: '#eef2f6', display: true }, ticks: { precision: 0 } },
        x2: { position: 'top', grid: { display: false }, ...moneyAxis(lang), beginAtZero: true },
        y: { grid: { display: false } },
      },
      plugins: { tooltip: moneyTooltip(lang, [1]) },
    });
  });

  protected readonly mixChart = computed(() => {
    this.lang.current();
    const d = this.data.value().data;
    if (!d) return { labels: [], datasets: [] };
    const a = this.active();
    const cell = (regionId: number | null, serviceId: string | null) =>
      d.matrix.find((c) => c.regionId === regionId && c.serviceId === serviceId)?.requests ?? 0;
    const datasets = d.topServices.map((s, i) => ({
      label: serviceName(s, this.lang.current()),
      data: a.map((r) => cell(r.regionId, s.serviceId)),
      backgroundColor: PALETTE[i % PALETTE.length],
      stack: 'm',
    }));
    if (d.matrix.some((c) => c.serviceId === null)) {
      datasets.push({ label: this.translate.instant('analytics.otherServices'), data: a.map((r) => cell(r.regionId, null)), backgroundColor: OTHER_COLOR, stack: 'm' });
    }
    return { labels: a.map((r) => this.rn(r)), datasets };
  });

  protected readonly mixOptions = computed(() =>
    baseOptions(this.lang.current(), { indexAxis: 'y', scales: { x: { stacked: true, grid: { color: '#eef2f6', display: true }, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } } }),
  );

  protected pickRegion(regionId: number | null): void {
    // Clicking the selected region again clears the filter.
    this.filter.emit({ regionId: regionId === this.query().regionId ? null : regionId, cityId: null });
  }

  protected drillRegion(r: RegionRow, kind: 'REQUESTS' | 'REVENUE'): void {
    this.drill.emit({ title: this.rn(r), kind, query: { ...this.query(), regionId: r.regionId, cityId: null } });
  }

  protected drillCity(c: CityRow): void {
    this.drill.emit({ title: this.cn(c), kind: 'REQUESTS', query: { ...this.query(), cityId: c.cityId } });
  }

  protected onCompare(e: unknown): void {
    const sel = selectedIndex(e as never);
    const r = sel ? this.active()[sel.index] : null;
    if (r) this.drillRegion(r, sel!.dataset === 1 ? 'REVENUE' : 'REQUESTS');
  }

  protected onMix(e: unknown): void {
    const sel = selectedIndex(e as never);
    const d = this.data.value().data;
    const r = sel ? this.active()[sel.index] : null;
    if (!sel || !r || !d) return;
    const s = d.topServices[sel.dataset];
    this.drill.emit({
      title: s ? `${this.rn(r)} · ${serviceName(s, this.lang.current())}` : this.rn(r),
      kind: 'REQUESTS',
      query: { ...this.query(), regionId: r.regionId, cityId: null, serviceId: s?.serviceId ?? this.query().serviceId },
    });
  }
}
