import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UIChart } from 'primeng/chart';
import { SelectButton } from 'primeng/selectbutton';

import { LanguageService } from '../../core/i18n/language.service';
import { AnalyticsApi, AnalyticsQuery, CityRow, DrillQuery, RegionRow } from './analytics.api';
import { OTHER_COLOR, PALETTE, alpha, baseOptions, countText, moneyAxis, moneyTooltip, pctText, sarCurrency, selectedIndex } from './charts';
import { loader } from './load';
import { serviceName } from './services.tab';
import { RegionMap } from './visuals';
import { KpiCard, StateBlock } from './widgets';

/** Regional analytics: demand and revenue by region and city, service mix per region, map. */
@Component({
  selector: 'app-regions-tab',
  imports: [FormsModule, TranslatePipe, UIChart, SelectButton, RegionMap, KpiCard, StateBlock],
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .85rem; margin-bottom: .85rem; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .85rem; margin-bottom: .85rem; }
    @media (max-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    h2 { font-size: 1rem; margin: 0 0 .25rem; display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .sub { color: var(--fo-muted); font-size: .8rem; margin: 0 0 .75rem; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th { text-align: start; color: var(--fo-muted); font-weight: 600; padding: .45rem .3rem; border-bottom: 1px solid var(--fo-border); }
    td { padding: .5rem .3rem; border-bottom: 1px solid var(--fo-border); }
    tr.row { cursor: pointer; } tr.row:hover td { background: #f8fafc; }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .bar { height: 5px; border-radius: 3px; background: var(--p-primary-400); margin-top: .3rem; }
    .note { font-size: .8rem; color: var(--fo-muted); margin: .5rem 0 0; }
    .table-wrap { max-height: 420px; overflow: auto; }
  `,
  template: `
    @let v = data.value();
    @if (v.state === 'error') {
      <div class="panel"><app-state kind="error" [message]="v.error" (retry)="data.reload()" /></div>
    } @else if (!v.data) {
      <div class="panel"><app-state kind="loading" /></div>
    } @else {
      @let d = v.data;
      <div class="kpis" [style.opacity]="v.state === 'loading' ? .6 : 1">
        @if (highlights().byRequests; as r) {
          <app-kpi icon="pi pi-map-marker" [label]="'analytics.reg.mostRequests' | translate" [value]="rn(r)" [hint]="'analytics.nRequests' | translate: { n: r.requests }" [clickable]="true" (pick)="drillRegion(r, 'REQUESTS')" />
        }
        @if (highlights().byRevenue; as r) {
          <app-kpi icon="pi pi-wallet" [label]="'analytics.reg.mostRevenue' | translate" [value]="rn(r)" [hint]="money(r.revenueHalalas) + ' · ' + pct(r.share)" [clickable]="true" (pick)="drillRegion(r, 'REVENUE')" />
        }
        @if (highlights().lowest; as r) {
          <app-kpi icon="pi pi-compass" [label]="'analytics.reg.lowest' | translate" [value]="rn(r)" [hint]="'analytics.nRequests' | translate: { n: r.requests }" [clickable]="true" (pick)="drillRegion(r, 'REQUESTS')" />
        }
        <app-kpi icon="pi pi-globe" [label]="'analytics.reg.coverage' | translate" [value]="highlights().active + ' / ' + highlights().total"
                 [hint]="d.unknownRequests ? ('analytics.reg.unknown' | translate: { n: d.unknownRequests }) : ('analytics.reg.coverageHint' | translate)" />
      </div>

      <div class="grid">
        <div class="panel">
          <h2>
            {{ 'analytics.reg.map' | translate }}
            <p-selectbutton [options]="metrics()" [(ngModel)]="metric" optionLabel="label" optionValue="value" [allowEmpty]="false" size="small" />
          </h2>
          <p class="sub">{{ 'analytics.reg.mapHint' | translate }}</p>
          <app-region-map [regions]="d.regions" [metric]="metric()" [selected]="query().regionId" (pick)="pickRegion($event)" />
        </div>
        <div class="panel">
          <h2>{{ 'analytics.reg.comparison' | translate }}</h2>
          <p class="sub">{{ 'analytics.clickToDrill' | translate }}</p>
          @if (active().length) {
            <p-chart type="bar" [data]="compareChart()" [options]="compareOptions()" [height]="barsHeight()" (onDataSelect)="onCompare($event)" />
          } @else {
            <app-state kind="empty" />
          }
        </div>
      </div>

      <div class="grid">
        <div class="panel">
          <h2>{{ 'analytics.reg.mix' | translate }}</h2>
          <p class="sub">{{ 'analytics.reg.mixHint' | translate }}</p>
          @if (active().length && d.topServices.length) {
            <p-chart type="bar" [data]="mixChart()" [options]="mixOptions()" [height]="barsHeight()" (onDataSelect)="onMix($event)" />
          } @else {
            <app-state kind="empty" />
          }
        </div>
        <div class="panel">
          <h2>{{ 'analytics.reg.cities' | translate }}</h2>
          <p class="sub">{{ 'analytics.reg.citiesHint' | translate }}</p>
          @if (d.cities.length) {
            <div class="table-wrap">
              <table>
                <thead><tr><th>{{ 'analytics.city' | translate }}</th><th class="num">{{ 'analytics.kpi.requests' | translate }}</th><th class="num">{{ 'analytics.revenue' | translate }}</th></tr></thead>
                <tbody>
                  @for (c of d.cities; track c.cityId) {
                    <tr class="row" (click)="drillCity(c)">
                      <td>{{ cn(c) }}<div class="bar" [style.width.%]="cityBar(c.requests)"></div></td>
                      <td class="num">{{ count(c.requests) }}</td>
                      <td class="num"><span class="ltr">{{ money(c.revenueHalalas) }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <app-state kind="empty" [message]="'analytics.reg.noCities' | translate" />
          }
        </div>
      </div>
      @if (d.unknownRequests) {
        <p class="note"><i class="pi pi-info-circle"></i> {{ 'analytics.reg.unknownNote' | translate: { n: d.unknownRequests } }}</p>
      }
    }
  `,
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
