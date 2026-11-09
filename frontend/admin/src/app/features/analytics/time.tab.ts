import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UIChart } from 'primeng/chart';
import { SelectButton } from 'primeng/selectbutton';

import { LanguageService } from '../../core/i18n/language.service';
import { AnalyticsApi, AnalyticsQuery, DrillQuery, Granularity } from './analytics.api';
import { MUTED, PALETTE, alpha, baseOptions, bucketLabel, countText, hourText, monthName, moneyAxis, moneyTooltip, sarCurrency, selectedIndex } from './charts';
import { loader } from './load';
import { Heatmap } from './visuals';
import { KpiCard, StateBlock } from './widgets';

interface Peaks {
  day: string | null;
  dayHint: string | null;
  hour: string | null;
  hourHint: string | null;
  month: string | null;
  monthHint: string | null;
  bucket: string | null;
  bucketHint: string | null;
}

/** Time-based analytics: performance per day / week / month / quarter / year, peak periods and seasonality. */
@Component({
  selector: 'app-time-tab',
  imports: [FormsModule, TranslatePipe, UIChart, SelectButton, Heatmap, KpiCard, StateBlock],
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .85rem; margin-bottom: .85rem; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .85rem; margin-bottom: .85rem; }
    @media (max-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .panel + .panel, .panel.block { margin-bottom: .85rem; }
    h2 { font-size: 1rem; margin: 0 0 .25rem; display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .sub { color: var(--fo-muted); font-size: .8rem; margin: 0 0 .75rem; }
  `,
  template: `
    @let v = data.value();
    @if (v.state === 'error') {
      <div class="panel"><app-state kind="error" [message]="v.error" (retry)="data.reload()" /></div>
    } @else if (!v.data) {
      <div class="panel"><app-state kind="loading" /></div>
    } @else {
      <div class="kpis" [style.opacity]="v.state === 'loading' ? .6 : 1">
        <app-kpi icon="pi pi-calendar" [label]="'analytics.time.peakDay' | translate" [value]="peaks().day" [hint]="peaks().dayHint" />
        <app-kpi icon="pi pi-clock" [label]="'analytics.time.peakHour' | translate" [value]="peaks().hour" [hint]="peaks().hourHint" />
        <app-kpi icon="pi pi-sun" [label]="'analytics.time.peakMonth' | translate" [value]="peaks().month" [hint]="peaks().monthHint" />
        <app-kpi icon="pi pi-chart-bar" [label]="'analytics.time.busiestPeriod' | translate" [value]="peaks().bucket" [hint]="peaks().bucketHint" />
      </div>

      <div class="panel block">
        <h2>
          {{ 'analytics.time.performance' | translate }}
          <p-selectbutton [options]="grans()" [ngModel]="granularity() ?? v.data.granularity" (ngModelChange)="granularity.set($event)" optionLabel="label" optionValue="value" [allowEmpty]="false" size="small" />
        </h2>
        <p class="sub">{{ 'analytics.clickToDrill' | translate }}</p>
        <p-chart type="bar" [data]="seriesChart()" [options]="seriesOptions()" height="300px" (onDataSelect)="onSeries($event)" />
      </div>

      <div class="grid">
        <div class="panel">
          <h2>{{ 'analytics.time.heatmap' | translate }}</h2>
          <p class="sub">{{ 'analytics.time.heatmapHint' | translate }}</p>
          <app-heatmap [cells]="v.data.heatmap" (pick)="onHeat($event)" />
        </div>
        <div class="panel">
          <h2>{{ 'analytics.time.byWeekday' | translate }}</h2>
          <p class="sub">{{ 'analytics.time.byWeekdayHint' | translate }}</p>
          <p-chart type="bar" [data]="weekdayChart()" [options]="countOptions()" height="260px" (onDataSelect)="onWeekday($event)" />
        </div>
      </div>

      <div class="panel block">
        <h2>
          {{ 'analytics.time.seasonal' | translate }}
          <p-selectbutton [options]="seasonMetrics()" [(ngModel)]="seasonMetric" optionLabel="label" optionValue="value" [allowEmpty]="false" size="small" />
        </h2>
        <p class="sub">{{ 'analytics.time.seasonalHint' | translate }}</p>
        <p-chart type="line" [data]="seasonChart()" [options]="seasonOptions()" height="280px" (onDataSelect)="onSeason($event)" />
      </div>
    }
  `,
})
export class TimeTab {
  private readonly api = inject(AnalyticsApi);
  private readonly lang = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly query = input.required<AnalyticsQuery>();
  readonly drill = output<DrillQuery>();

  /** null = let the server pick from the range length. */
  protected readonly granularity = signal<Granularity | null>(null);
  protected readonly seasonMetric = signal<'requests' | 'revenue'>('requests');
  private readonly key = computed(() => ({ q: this.query(), g: this.granularity() }));
  protected readonly data = loader(this.key, (k) => this.api.time(k.q, k.g ?? undefined));

  private t(k: string, p?: Record<string, unknown>): string {
    return this.translate.instant(k, p);
  }

  protected readonly grans = computed(() => {
    this.lang.current();
    return (['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'] as Granularity[]).map((g) => ({ value: g, label: this.t('analytics.gran.' + g) }));
  });

  protected readonly seasonMetrics = computed(() => {
    this.lang.current();
    return [
      { value: 'requests', label: this.t('analytics.kpi.requests') },
      { value: 'revenue', label: this.t('analytics.revenue') },
    ];
  });

  protected readonly peaks = computed(() => {
    const d = this.data.value().data;
    const lang = this.lang.current();
    const out: Peaks = { day: null, dayHint: null, hour: null, hourHint: null, month: null, monthHint: null, bucket: null, bucketHint: null };
    if (!d) return out;
    const byDay = new Array(7).fill(0);
    const byHour = new Array(24).fill(0);
    for (const c of d.heatmap) {
      byDay[c.dow] += c.requests;
      byHour[c.hour] += c.requests;
    }
    const total = byDay.reduce((a, b) => a + b, 0);
    if (total) {
      const day = byDay.indexOf(Math.max(...byDay));
      const hour = byHour.indexOf(Math.max(...byHour));
      out.day = this.t('analytics.dow.' + day);
      out.dayHint = this.t('analytics.time.shareOfRequests', { p: Math.round((byDay[day] / total) * 100) });
      out.hour = `${hourText(hour, lang)} – ${hourText((hour + 1) % 24, lang)}`;
      out.hourHint = this.t('analytics.nRequests', { n: countText(byHour[hour], lang) });
    }
    const byMonth = new Array(12).fill(0);
    for (const s of d.seasonal) byMonth[s.month - 1] += s.requests;
    if (byMonth.some((x) => x > 0)) {
      const m = byMonth.indexOf(Math.max(...byMonth));
      out.month = monthName(m + 1, lang, 'long');
      out.monthHint = this.t('analytics.time.seasonBasis');
    }
    const best = [...d.series].sort((a, b) => b.requests - a.requests)[0];
    if (best?.requests) {
      out.bucket = bucketLabel(best.start, d.granularity, lang);
      out.bucketHint = `${this.t('analytics.nRequests', { n: countText(best.requests, lang) })} · ${sarCurrency(best.revenueHalalas, lang)}`;
    }
    return out;
  });

  protected readonly seriesChart = computed(() => {
    const d = this.data.value().data;
    if (!d) return { labels: [], datasets: [] };
    const lang = this.lang.current();
    return {
      labels: d.series.map((p) => bucketLabel(p.start, d.granularity, lang)),
      datasets: [
        { type: 'line', label: this.t('analytics.revenue'), data: d.series.map((p) => p.revenueHalalas), borderColor: PALETTE[1], backgroundColor: PALETTE[1], yAxisID: 'money', tension: 0.3, pointRadius: d.series.length > 40 ? 0 : 3, order: 0 },
        { type: 'bar', label: this.t('analytics.kpi.requests'), data: d.series.map((p) => p.requests), backgroundColor: alpha(PALETTE[0], 0.7), yAxisID: 'y', borderRadius: 3, order: 1 },
      ],
    };
  });

  protected readonly seriesOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, {
      scales: {
        y: { position: lang === 'ar' ? 'right' : 'left', ticks: { precision: 0 } },
        money: { position: lang === 'ar' ? 'left' : 'right', grid: { display: false }, beginAtZero: true, ...moneyAxis(lang) },
      },
      plugins: { tooltip: moneyTooltip(lang, ['money']) },
    });
  });

  protected readonly weekdayChart = computed(() => {
    const d = this.data.value().data;
    this.lang.current();
    const byDay = new Array(7).fill(0);
    for (const c of d?.heatmap ?? []) byDay[c.dow] += c.requests;
    const max = Math.max(...byDay);
    return {
      labels: byDay.map((_, i) => this.t('analytics.dow.' + i)),
      datasets: [{ label: this.t('analytics.kpi.requests'), data: byDay, backgroundColor: byDay.map((v) => (v === max && v > 0 ? PALETTE[0] : alpha(PALETTE[0], 0.4))), borderRadius: 4 }],
    };
  });

  protected readonly countOptions = computed(() => baseOptions(this.lang.current(), { plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } }));

  protected readonly seasonChart = computed(() => {
    const d = this.data.value().data;
    if (!d) return { labels: [], datasets: [] };
    const lang = this.lang.current();
    const years = [...new Set(d.seasonal.map((s) => s.year))].sort();
    const revenue = this.seasonMetric() === 'revenue';
    const colors = [alpha(MUTED, 0.6), PALETTE[2], PALETTE[0]];
    return {
      labels: Array.from({ length: 12 }, (_, i) => monthName(i + 1, lang)),
      datasets: years.map((y, i) => ({
        label: String(y),
        data: Array.from({ length: 12 }, (_, m) => {
          const c = d.seasonal.find((s) => s.year === y && s.month === m + 1);
          return c ? (revenue ? c.revenueHalalas : c.requests) : 0;
        }),
        borderColor: colors[i + (3 - years.length)] ?? PALETTE[i],
        backgroundColor: colors[i + (3 - years.length)] ?? PALETTE[i],
        borderWidth: i === years.length - 1 ? 3 : 2,
        tension: 0.3,
        pointRadius: 3,
      })),
    };
  });

  protected readonly seasonOptions = computed(() => {
    const lang = this.lang.current();
    return this.seasonMetric() === 'revenue'
      ? baseOptions(lang, { scales: { y: moneyAxis(lang) }, plugins: { tooltip: moneyTooltip(lang) } })
      : baseOptions(lang, { scales: { y: { ticks: { precision: 0 } } } });
  });

  // ---- drill-down

  protected onSeries(e: unknown): void {
    const sel = selectedIndex(e as never);
    const d = this.data.value().data;
    const p = sel && d ? d.series[sel.index] : null;
    if (!p || !d) return;
    this.drill.emit({
      title: bucketLabel(p.start, d.granularity, this.lang.current()),
      kind: sel!.dataset === 0 ? 'REVENUE' : 'REQUESTS',
      query: { ...this.query(), from: p.start, to: p.end },
    });
  }

  protected onHeat(c: { dow: number; hour: number }): void {
    this.drill.emit({
      title: `${this.t('analytics.dow.' + c.dow)} · ${hourText(c.hour, this.lang.current())}`,
      kind: 'REQUESTS',
      query: this.query(),
      dow: c.dow,
      hour: c.hour,
    });
  }

  protected onWeekday(e: unknown): void {
    const sel = selectedIndex(e as never);
    if (sel) this.drill.emit({ title: this.t('analytics.dow.' + sel.index), kind: 'REQUESTS', query: this.query(), dow: sel.index });
  }

  protected onSeason(e: unknown): void {
    const sel = selectedIndex(e as never);
    const d = this.data.value().data;
    if (!sel || !d) return;
    const years = [...new Set(d.seasonal.map((s) => s.year))].sort();
    const y = years[sel.dataset];
    const m = sel.index;
    const last = new Date(y, m + 1, 0).getDate();
    const mm = String(m + 1).padStart(2, '0');
    this.drill.emit({
      title: `${monthName(m + 1, this.lang.current(), 'long')} ${y}`,
      kind: this.seasonMetric() === 'revenue' ? 'REVENUE' : 'REQUESTS',
      query: { ...this.query(), from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` },
    });
  }
}
