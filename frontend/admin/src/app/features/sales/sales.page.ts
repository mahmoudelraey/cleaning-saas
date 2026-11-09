import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { InputNumber } from 'primeng/inputnumber';
import { SelectButton } from 'primeng/selectbutton';

import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { toHalalas, toSar } from '../../shared/format';
import { AnalyticsApi, AnalyticsQuery, DrillQuery, PeriodRow, RegionRow, ServiceRow, growth } from '../analytics/analytics.api';
import { MUTED, PALETTE, alpha, baseOptions, countText, moneyAxis, moneyTooltip, pctText, sarCurrency, selectedIndex } from '../analytics/charts';
import { AnalyticsFilters, defaultQuery } from '../analytics/filter-bar';
import { loader } from '../analytics/load';
import { RecordsDrawer } from '../analytics/records-drawer';
import { serviceName } from '../analytics/services.tab';
import { ExportMenu } from '../analytics/visuals';
import { KpiCard, StateBlock } from '../analytics/widgets';

type PeriodKind = 'months' | 'quarters' | 'years';

/**
 * Sales management: total sales and revenue, period comparisons (monthly / quarterly / yearly against the same
 * period a year earlier), best and weakest services, sales by region and city, and (owner) profitability per
 * service with editable unit costs.
 */
@Component({
  selector: 'app-sales',
  imports: [FormsModule, TranslatePipe, UIChart, SelectButton, InputNumber, Button, AnalyticsFilters, RecordsDrawer, ExportMenu, KpiCard, StateBlock],
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: .85rem; margin-bottom: .85rem; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .85rem; margin-bottom: .85rem; }
    @media (max-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .block { margin-bottom: .85rem; }
    h2 { font-size: 1rem; margin: 0 0 .25rem; display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .sub { color: var(--fo-muted); font-size: .8rem; margin: 0 0 .75rem; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th { text-align: start; color: var(--fo-muted); font-weight: 600; padding: .45rem .35rem; border-bottom: 1px solid var(--fo-border); white-space: nowrap; }
    td { padding: .5rem .35rem; border-bottom: 1px solid var(--fo-border); }
    tr.row { cursor: pointer; } tr.row:hover td { background: #f8fafc; }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .up { color: #15803d; } .down { color: #b91c1c; }
    .rank { list-style: none; margin: 0; padding: 0; display: grid; gap: .45rem; }
    .rank li { display: grid; grid-template-columns: 1.6rem minmax(0, 1fr) auto; gap: .5rem; align-items: center; cursor: pointer; padding: .3rem .2rem; border-radius: 6px; }
    .rank li:hover { background: #f8fafc; }
    .rank .n { width: 1.6rem; height: 1.6rem; border-radius: 50%; display: grid; place-items: center; font-size: .75rem; font-weight: 700; }
    .rank.best .n { background: #dcfce7; color: #15803d; } .rank.low .n { background: #fee2e2; color: #b91c1c; }
    .rank small { color: var(--fo-muted); display: block; }
    .cost { display: flex; gap: .35rem; align-items: center; justify-content: flex-end; }
    :host ::ng-deep .cost .p-inputnumber-input { width: 7rem; text-align: end; }
    .note { font-size: .8rem; color: var(--fo-muted); margin: .6rem 0 0; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'sales.title' | translate }}</h1>
        <p>{{ 'sales.subtitle' | translate }}</p>
      </div>
      <app-export-menu [query]="query()" />
    </div>

    <app-analytics-filters [(query)]="query" />

    @let v = data.value();
    @if (v.state === 'error') {
      <div class="panel"><app-state kind="error" [message]="v.error" (retry)="data.reload()" /></div>
    } @else if (!v.data) {
      <div class="panel"><app-state kind="loading" /></div>
    } @else {
      @let d = v.data;
      @let c = d.current;
      @let p = d.previous;
      <div class="kpis" [style.opacity]="v.state === 'loading' ? .6 : 1">
        <app-kpi icon="pi pi-shopping-cart" [label]="'sales.kpi.gross' | translate" [value]="money(c.grossSalesHalalas)" [delta]="g(c.grossSalesHalalas, p?.grossSalesHalalas)"
                 [hint]="'sales.kpi.grossHint' | translate: { v: money(c.vatHalalas) }" [clickable]="true" (pick)="drillRevenue()" />
        <app-kpi icon="pi pi-wallet" [label]="'analytics.kpi.revenue' | translate" [value]="money(c.revenueHalalas)" [delta]="g(c.revenueHalalas, p?.revenueHalalas)"
                 [hint]="'analytics.kpi.revenueHint' | translate" [clickable]="true" (pick)="drillRevenue()" />
        <app-kpi icon="pi pi-file" [label]="'sales.kpi.invoices' | translate" [value]="count(c.invoices)" [delta]="g(c.invoices, p?.invoices)"
                 [hint]="'sales.kpi.avg' | translate: { v: money(c.invoices ? c.grossSalesHalalas / c.invoices : 0) }" />
        @if (c.collectedHalalas !== null) {
          <app-kpi icon="pi pi-money-bill" [label]="'analytics.kpi.collected' | translate" [value]="money(c.collectedHalalas)" [delta]="g(c.collectedHalalas, p?.collectedHalalas)"
                   [hint]="'sales.kpi.collectionRate' | translate: { r: pct(c.grossSalesHalalas ? (c.collectedHalalas ?? 0) / c.grossSalesHalalas : null) }" />
        }
        <app-kpi icon="pi pi-percentage" [label]="'analytics.kpi.growth' | translate" [value]="signed(g(c.revenueHalalas, p?.revenueHalalas))"
                 [negative]="(g(c.revenueHalalas, p?.revenueHalalas) ?? 0) < 0" [hint]="p ? ('analytics.kpi.growthHint' | translate: { v: money(p.revenueHalalas) }) : ('analytics.kpi.noCompare' | translate)" />
      </div>

      <div class="panel block">
        <h2>
          {{ 'sales.periods' | translate }}
          <p-selectbutton [options]="periodKinds()" [(ngModel)]="periodKind" optionLabel="label" optionValue="value" [allowEmpty]="false" size="small" />
        </h2>
        <p class="sub">{{ 'sales.periodsHint' | translate }}</p>
        <p-chart type="bar" [data]="periodChart()" [options]="periodOptions()" height="300px" (onDataSelect)="onPeriod($event)" />
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ 'sales.period' | translate }}</th>
                <th class="num">{{ 'analytics.revenue' | translate }}</th>
                <th class="num">{{ 'sales.lastYear' | translate }}</th>
                <th class="num">{{ 'sales.yoy' | translate }}</th>
                <th class="num">{{ 'analytics.kpi.requests' | translate }}</th>
                <th class="num">{{ 'analytics.kpi.completed' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of periods(); track r.key) {
                @let gr = g(r.revenueHalalas, r.previousRevenueHalalas);
                <tr class="row" (click)="drillPeriod(r)">
                  <td>{{ periodLabel(r) }}</td>
                  <td class="num"><span class="ltr">{{ money(r.revenueHalalas) }}</span></td>
                  <td class="num muted"><span class="ltr">{{ money(r.previousRevenueHalalas) }}</span></td>
                  <td class="num" [class.up]="(gr ?? 0) > 0" [class.down]="(gr ?? 0) < 0"><span class="ltr">{{ signed(gr) }}</span></td>
                  <td class="num">{{ count(r.requests) }}</td>
                  <td class="num">{{ count(r.completed) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid">
        <div class="panel">
          <h2>{{ 'sales.best' | translate }}</h2>
          <p class="sub">{{ 'sales.bestHint' | translate }}</p>
          @if (best().length) {
            <ol class="rank best">
              @for (s of best(); track s.serviceId; let i = $index) {
                <li (click)="drillService(s)"><span class="n">{{ i + 1 }}</span><span>{{ nm(s) }}<small>{{ 'analytics.nRequests' | translate: { n: s.requests } }} · {{ pct(s.share) }}</small></span><span class="num ltr">{{ money(s.revenueHalalas) }}</span></li>
              }
            </ol>
          } @else { <app-state kind="empty" /> }
        </div>
        <div class="panel">
          <h2>{{ 'sales.lowest' | translate }}</h2>
          <p class="sub">{{ 'sales.lowestHint' | translate }}</p>
          @if (lowest().length) {
            <ol class="rank low">
              @for (s of lowest(); track s.serviceId; let i = $index) {
                <li (click)="drillService(s)"><span class="n">{{ i + 1 }}</span><span>{{ nm(s) }}<small>{{ 'analytics.nRequests' | translate: { n: s.requests } }} · {{ signed(g(s.revenueHalalas, s.previousRevenueHalalas)) }}</small></span><span class="num ltr">{{ money(s.revenueHalalas) }}</span></li>
              }
            </ol>
          } @else { <app-state kind="empty" /> }
        </div>
      </div>

      <div class="grid">
        <div class="panel">
          <h2>{{ 'sales.byRegion' | translate }}</h2>
          <p class="sub">{{ 'analytics.clickToDrill' | translate }}</p>
          @if (regionRows().length) {
            <p-chart type="bar" [data]="regionChart()" [options]="regionOptions()" [height]="regionHeight()" (onDataSelect)="onRegion($event)" />
          } @else { <app-state kind="empty" /> }
        </div>
        <div class="panel">
          <h2>{{ 'sales.byCity' | translate }}</h2>
          <p class="sub">{{ 'analytics.reg.citiesHint' | translate }}</p>
          @if (cities().length) {
            <div class="table-wrap">
              <table>
                <thead><tr><th>{{ 'analytics.city' | translate }}</th><th class="num">{{ 'analytics.revenue' | translate }}</th><th class="num">{{ 'analytics.kpi.requests' | translate }}</th></tr></thead>
                <tbody>
                  @for (ct of cities(); track ct.cityId) {
                    <tr class="row" (click)="drillCity(ct.cityId, ctName(ct))"><td>{{ ctName(ct) }}</td><td class="num"><span class="ltr">{{ money(ct.revenueHalalas) }}</span></td><td class="num">{{ count(ct.requests) }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          } @else { <app-state kind="empty" /> }
        </div>
      </div>

      @if (d.financials) {
        <div class="panel block">
          <h2>{{ 'sales.profitability' | translate }}</h2>
          <p class="sub">{{ 'sales.profitabilityHint' | translate }}</p>
          <div class="table-wrap">
            <table style="min-width: 760px">
              <thead>
                <tr>
                  <th>{{ 'analytics.service' | translate }}</th>
                  <th class="num">{{ 'analytics.revenue' | translate }}</th>
                  <th class="num">{{ 'sales.unitCost' | translate }}</th>
                  <th class="num">{{ 'analytics.directCost' | translate }}</th>
                  <th class="num">{{ 'analytics.grossProfit' | translate }}</th>
                  <th class="num">{{ 'analytics.margin' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (s of d.services.services; track s.serviceId) {
                  <tr>
                    <td>{{ nm(s) }}</td>
                    <td class="num"><span class="ltr">{{ money(s.revenueHalalas) }}</span></td>
                    <td class="num">
                      <span class="cost">
                        <p-inputnumber [ngModel]="costValue(s)" (ngModelChange)="draft(s.serviceId, $event)" mode="decimal"
                                       [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" [placeholder]="'sales.costUnknown' | translate" [ariaLabel]="'sales.unitCost' | translate" />
                        @if (costDraft()[s.serviceId] !== undefined) {
                          <p-button icon="pi pi-check" size="small" [text]="true" [loading]="savingCost() === s.serviceId" (onClick)="saveCost(s)" [ariaLabel]="'common.save' | translate" />
                        }
                      </span>
                    </td>
                    <td class="num"><span class="ltr">{{ s.directCostHalalas === null ? '—' : money(s.directCostHalalas) }}</span></td>
                    <td class="num" [class.down]="(s.profitHalalas ?? 0) < 0" [class.up]="(s.profitHalalas ?? 0) > 0"><span class="ltr">{{ s.profitHalalas === null ? '—' : money(s.profitHalalas) }}</span></td>
                    <td class="num">{{ pct(s.margin) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="note"><i class="pi pi-info-circle"></i> {{ 'sales.profitNote' | translate }}</p>
        </div>
      }
    }

    <app-records-drawer [(drill)]="drill" />
  `,
})
export class SalesPage {
  private readonly api = inject(AnalyticsApi);
  private readonly http = inject(HttpClient);
  private readonly lang = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);

  protected readonly query = signal<AnalyticsQuery>(defaultQuery('thisMonth'));
  protected readonly drill = signal<DrillQuery | null>(null);
  protected readonly periodKind = signal<PeriodKind>('months');
  protected readonly data = loader(this.query, (q) => this.api.sales(q));
  /** Unit costs being edited (SAR), by service id. */
  protected readonly costDraft = signal<Record<string, number | null>>({});
  protected readonly savingCost = signal<string | null>(null);

  protected readonly periodKinds = computed(() => {
    this.lang.current();
    return (['months', 'quarters', 'years'] as PeriodKind[]).map((k) => ({ value: k, label: this.translate.instant('sales.kind.' + k) }));
  });

  protected readonly periods = computed<PeriodRow[]>(() => {
    const d = this.data.value().data;
    return d ? d[this.periodKind()] : [];
  });

  private readonly services = computed(() => this.data.value().data?.services.services ?? []);
  protected readonly best = computed(() => this.services().filter((s) => s.revenueHalalas > 0).slice(0, 5));
  protected readonly lowest = computed(() => {
    const s = this.services();
    const bestIds = new Set(this.best().map((x) => x.serviceId));
    return [...s].sort((a, b) => a.revenueHalalas - b.revenueHalalas || a.requests - b.requests).filter((x) => !bestIds.has(x.serviceId)).slice(0, 5);
  });
  protected readonly regionRows = computed(() =>
    (this.data.value().data?.regions ?? []).filter((r) => r.regionId != null && r.revenueHalalas > 0).sort((a, b) => b.revenueHalalas - a.revenueHalalas),
  );
  protected readonly regionHeight = computed(() => `${Math.max(200, this.regionRows().length * 32 + 60)}px`);
  protected readonly cities = computed(() =>
    [...(this.data.value().data?.cities ?? [])].sort((a, b) => b.revenueHalalas - a.revenueHalalas).slice(0, 12),
  );

  protected money(h: number | null | undefined): string {
    return sarCurrency(h == null ? h : Math.round(h), this.lang.current());
  }

  protected count(n: number): string {
    return countText(n, this.lang.current());
  }

  protected pct(f: number | null | undefined): string {
    return pctText(f, this.lang.current());
  }

  protected signed(f: number | null | undefined): string {
    return pctText(f, this.lang.current(), true);
  }

  protected g(c: number | null | undefined, p: number | null | undefined): number | null {
    return growth(c, p);
  }

  /** The edited value while editing (null = cleared), otherwise the saved cost in SAR. */
  protected costValue(s: ServiceRow): number | null {
    const d = this.costDraft();
    if (s.serviceId in d) return d[s.serviceId];
    return s.unitCostHalalas == null ? null : toSar(s.unitCostHalalas);
  }

  protected nm(s: ServiceRow): string {
    return serviceName(s, this.lang.current());
  }

  protected ctName(c: { nameAr: string; nameEn: string }): string {
    return this.lang.current() === 'en' ? c.nameEn : c.nameAr;
  }

  private rn(r: RegionRow): string {
    return this.lang.current() === 'en' ? r.nameEn : r.nameAr.replace(/^منطقة\s+/, '');
  }

  protected periodLabel(r: PeriodRow): string {
    const lang = this.lang.current();
    if (this.periodKind() === 'months') {
      const [y, m] = r.key.split('-').map(Number);
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
    }
    if (this.periodKind() === 'quarters') {
      const [y, q] = r.key.split('-Q');
      return this.translate.instant('sales.quarter', { q, y });
    }
    return r.key;
  }

  protected readonly periodChart = computed(() => {
    this.lang.current();
    const rows = this.periods();
    return {
      labels: rows.map((r) => this.periodLabel(r)),
      datasets: [
        { type: 'bar', label: this.translate.instant('analytics.revenue'), data: rows.map((r) => r.revenueHalalas), backgroundColor: PALETTE[0], borderRadius: 4, order: 1 },
        { type: 'line', label: this.translate.instant('sales.lastYear'), data: rows.map((r) => r.previousRevenueHalalas), borderColor: MUTED, borderDash: [5, 4], backgroundColor: MUTED, tension: 0.3, pointRadius: 3, order: 0 },
      ],
    };
  });

  protected readonly periodOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, { scales: { y: moneyAxis(lang) }, plugins: { tooltip: moneyTooltip(lang) } });
  });

  protected readonly regionChart = computed(() => {
    this.lang.current();
    const rows = this.regionRows();
    return {
      labels: rows.map((r) => this.rn(r)),
      datasets: [{ label: this.translate.instant('analytics.revenue'), data: rows.map((r) => r.revenueHalalas), backgroundColor: rows.map((_, i) => (i === 0 ? PALETTE[0] : alpha(PALETTE[0], 0.55))), borderRadius: 4 }],
    };
  });

  protected readonly regionOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: moneyTooltip(lang) }, scales: { x: { ...moneyAxis(lang), grid: { color: '#eef2f6', display: true } }, y: { grid: { display: false } } } });
  });

  // ---- drill-down

  protected drillRevenue(): void {
    this.drill.set({ title: this.translate.instant('analytics.kpi.revenue'), kind: 'REVENUE', query: this.query() });
  }

  protected drillPeriod(r: PeriodRow): void {
    this.drill.set({ title: this.periodLabel(r), kind: 'REVENUE', query: { ...this.query(), from: r.start, to: r.end } });
  }

  protected onPeriod(e: unknown): void {
    const sel = selectedIndex(e as never);
    const r = sel ? this.periods()[sel.index] : null;
    if (!r || !sel) return;
    if (sel.dataset === 1) {
      const shift = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
      // Feb 29 has no twin a year earlier: end on Feb 28.
      const end = shift(r.end).endsWith('-02-29') ? shift(r.end).replace('-02-29', '-02-28') : shift(r.end);
      this.drill.set({ title: `${this.periodLabel(r)} · ${this.translate.instant('sales.lastYear')}`, kind: 'REVENUE', query: { ...this.query(), from: shift(r.start), to: end } });
    } else {
      this.drillPeriod(r);
    }
  }

  protected drillService(s: ServiceRow): void {
    this.drill.set({ title: this.nm(s), kind: 'REVENUE', query: { ...this.query(), serviceId: s.serviceId } });
  }

  protected onRegion(e: unknown): void {
    const sel = selectedIndex(e as never);
    const r = sel ? this.regionRows()[sel.index] : null;
    if (r) this.drill.set({ title: this.rn(r), kind: 'REVENUE', query: { ...this.query(), regionId: r.regionId, cityId: null } });
  }

  protected drillCity(cityId: number, title: string): void {
    this.drill.set({ title, kind: 'REVENUE', query: { ...this.query(), cityId } });
  }

  // ---- unit costs (owner)

  protected draft(id: string, value: number | null): void {
    this.costDraft.update((d) => ({ ...d, [id]: value }));
  }

  protected saveCost(s: ServiceRow): void {
    const value = this.costDraft()[s.serviceId];
    this.savingCost.set(s.serviceId);
    this.http.put(`/api/v1/finance/service-costs/${s.serviceId}`, { costHalalas: value == null ? null : toHalalas(value) }).subscribe({
      next: () => {
        this.savingCost.set(null);
        this.costDraft.update((d) => {
          const rest = { ...d };
          delete rest[s.serviceId];
          return rest;
        });
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
        this.data.reload();
      },
      error: (e) => {
        this.savingCost.set(null);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }
}
