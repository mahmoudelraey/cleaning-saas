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
import { AnalyticsFilters, defaultQuery } from '../analytics/filter-bar/filter-bar';
import { loader } from '../analytics/load';
import { RecordsDrawer } from '../analytics/records-drawer/records-drawer';
import { serviceName } from '../analytics/services/services.tab';
import { ExportMenu } from '../analytics/visuals/visuals';
import { KpiCard, StateBlock } from '../analytics/widgets/widgets';

type PeriodKind = 'months' | 'quarters' | 'years';

/**
 * Sales management: total sales and revenue, period comparisons (monthly / quarterly / yearly against the same
 * period a year earlier), best and weakest services, sales by region and city, and (owner) profitability per
 * service with editable unit costs.
 */
@Component({
  selector: 'app-sales',
  imports: [FormsModule, TranslatePipe, UIChart, SelectButton, InputNumber, Button, AnalyticsFilters, RecordsDrawer, ExportMenu, KpiCard, StateBlock],
  styleUrl: './sales.page.scss',
  templateUrl: './sales.page.html',
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
