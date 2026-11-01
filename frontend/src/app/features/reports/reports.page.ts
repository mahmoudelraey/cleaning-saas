import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { SelectButton } from 'primeng/selectbutton';

import { ReportSummary } from '../../core/api.types';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { SarPipe, toSar } from '../../shared/format';

type Preset = 'month' | 'lastMonth' | 'days30' | 'custom';

/** Owner reports: bookings, revenue, collection, services and technician performance for a date range. */
@Component({
  selector: 'app-reports',
  imports: [FormsModule, TranslatePipe, Button, DatePicker, SelectButton, SarPipe],
  styles: `
    .toolbar { display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .kpi { display: grid; gap: .25rem; }
    .kpi span { color: var(--fo-muted); font-size: .85rem; }
    .kpi strong { font-size: 1.45rem; font-variant-numeric: tabular-nums; }
    .kpi small { color: var(--fo-muted); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
    @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
    h2 { font-size: 1.05rem; margin: 0 0 .75rem; display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
    .legend { display: flex; gap: 1rem; font-size: .8rem; color: var(--fo-muted); font-weight: 400; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-inline-end: .3rem; vertical-align: middle; }
    .chart { width: 100%; overflow-x: auto; }
    .chart svg { display: block; width: 100%; min-width: 520px; height: 220px; }
    table { width: 100%; border-collapse: collapse; font-size: .92rem; }
    th { text-align: start; color: var(--fo-muted); font-weight: 600; padding: .45rem .25rem; border-bottom: 1px solid var(--fo-border); }
    td { padding: .5rem .25rem; border-bottom: 1px solid var(--fo-border); }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .bar { height: 6px; border-radius: 3px; background: var(--p-primary-400); margin-top: .3rem; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-inline-end: .4rem; }
    .loading { text-align: center; padding: 3rem; color: var(--fo-muted); }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'reports.title' | translate }}</h1>
        <p>{{ 'reports.subtitle' | translate }} · <span class="muted">{{ 'reports.basis' | translate }}</span></p>
      </div>
      <p-button icon="pi pi-download" [label]="'reports.exportCsv' | translate" [outlined]="true" [disabled]="!report()" (onClick)="exportCsv()" />
    </div>

    <div class="toolbar">
      <p-selectbutton [options]="presets()" [(ngModel)]="preset" (onChange)="applyPreset()" optionLabel="label" optionValue="value" [allowEmpty]="false" />
      @if (preset === 'custom') {
        <p-datepicker [(ngModel)]="range" selectionMode="range" [readonlyInput]="true" [showIcon]="true" dateFormat="yy-mm-dd" (onSelect)="onRange()" [maxDate]="today" />
      }
    </div>

    @if (report(); as r) {
      <div class="kpis">
        <div class="panel kpi">
          <span>{{ 'reports.collected' | translate }}</span>
          <strong class="ltr">{{ r.revenue.collectedHalalas | sar }}</strong>
          <small>{{ 'reports.invoiced' | translate }} <span class="ltr">{{ r.revenue.invoicedHalalas | sar }}</span></small>
        </div>
        <div class="panel kpi">
          <span>{{ 'reports.outstanding' | translate }}</span>
          <strong class="ltr">{{ r.revenue.outstandingHalalas | sar }}</strong>
          <small>{{ 'reports.outstandingHint' | translate }}</small>
        </div>
        <div class="panel kpi">
          <span>{{ 'reports.completedVisits' | translate }}</span>
          <strong class="ltr">{{ r.bookings.completed }} <small>/ {{ r.bookings.total }}</small></strong>
          <small>{{ 'reports.avgTicket' | translate }} <span class="ltr">{{ r.revenue.averageTicketHalalas | sar }}</span></small>
        </div>
        <div class="panel kpi">
          <span>{{ 'reports.cancelRate' | translate }}</span>
          <strong>{{ pct(r.bookings.cancelled + r.bookings.noShow, r.bookings.total) }}%</strong>
          <small>{{ 'reports.cancelDetail' | translate: { c: r.bookings.cancelled, n: r.bookings.noShow } }}</small>
        </div>
        <div class="panel kpi">
          <span>{{ 'reports.customers' | translate }}</span>
          <strong>{{ r.customers.active }}</strong>
          <small>{{ 'reports.customersDetail' | translate: { n: r.customers.newCustomers, r: r.customers.returning } }}</small>
        </div>
        <div class="panel kpi">
          <span>{{ 'reports.fromPage' | translate }}</span>
          <strong>{{ r.bookings.fromBookingPage }}</strong>
          <small>{{ pct(r.bookings.fromBookingPage, r.bookings.total) }}% {{ 'reports.ofBookings' | translate }}</small>
        </div>
      </div>

      <div class="panel">
        <h2>
          {{ 'reports.daily' | translate }}
          <span class="legend">
            <span><i style="background: var(--p-primary-500)"></i>{{ 'reports.collected' | translate }}</span>
            <span><i style="background: #f59e0b"></i>{{ 'reports.bookingsCount' | translate }}</span>
          </span>
        </h2>
        @let c = chart();
        <div class="chart">
          <svg [attr.viewBox]="'0 0 ' + c.w + ' ' + c.h" preserveAspectRatio="none" role="img" [attr.aria-label]="'reports.daily' | translate" dir="ltr">
            @for (g of c.grid; track g.y) {
              <line x1="0" [attr.x2]="c.w" [attr.y1]="g.y" [attr.y2]="g.y" stroke="var(--fo-border)" stroke-width="1" />
            }
            @for (b of c.bars; track b.x) {
              <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.bw" [attr.height]="b.bh" rx="2" fill="var(--p-primary-500)"><title>{{ b.label }}</title></rect>
            }
            <polyline [attr.points]="c.line" fill="none" stroke="#f59e0b" stroke-width="2" />
            @for (l of c.labels; track l.x) {
              <text [attr.x]="l.x" [attr.y]="c.h - 4" font-size="10" fill="var(--fo-muted)" [attr.text-anchor]="l.anchor">{{ l.text }}</text>
            }
          </svg>
        </div>
      </div>

      <div class="two">
        <div class="panel">
          <h2>{{ 'reports.topServices' | translate }}</h2>
          <table>
            <thead><tr><th>{{ 'bookings.service' | translate }}</th><th class="num">{{ 'reports.visits' | translate }}</th><th class="num">{{ 'reports.revenue' | translate }}</th></tr></thead>
            <tbody>
              @for (s of r.topServices; track s.serviceId) {
                <tr>
                  <td>{{ s.name }}<div class="bar" [style.width.%]="share(s.revenueHalalas, maxService())"></div></td>
                  <td class="num">{{ s.bookings }}</td>
                  <td class="num"><span class="ltr">{{ s.revenueHalalas | sar }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="3" class="muted">{{ 'reports.noData' | translate }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="panel">
          <h2>{{ 'reports.technicians' | translate }}</h2>
          <table>
            <thead><tr><th>{{ 'nav.technicians' | translate }}</th><th class="num">{{ 'reports.done' | translate }}</th><th class="num">{{ 'reports.hours' | translate }}</th><th class="num">{{ 'reports.revenue' | translate }}</th></tr></thead>
            <tbody>
              @for (t of r.technicians; track t.technicianId) {
                <tr>
                  <td><span class="dot" [style.background]="t.color"></span>{{ t.name }}@if (t.noShow) { <small class="muted"> · {{ 'reports.noShows' | translate: { n: t.noShow } }}</small> }</td>
                  <td class="num"><span class="ltr">{{ t.completed }} / {{ t.visits }}</span></td>
                  <td class="num">{{ t.hours }}</td>
                  <td class="num"><span class="ltr">{{ t.completedValueHalalas | sar }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="muted">{{ 'reports.noData' | translate }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @else {
      <div class="loading"><i class="pi pi-spin pi-spinner"></i></div>
    }
  `,
})
export class ReportsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  private readonly lang = inject(LanguageService);

  protected readonly report = signal<ReportSummary | null>(null);
  protected readonly today = new Date();
  protected preset: Preset = 'month';
  protected range: Date[] | null = null;

  protected readonly presets = computed(() =>
    (['month', 'lastMonth', 'days30', 'custom'] as Preset[]).map((p) => ({ value: p, label: this.translate.instant('reports.preset.' + p) })),
  );
  protected readonly maxService = computed(() => Math.max(1, ...(this.report()?.topServices.map((s) => s.revenueHalalas) ?? [1])));

  protected readonly chart = computed(() => {
    const days = this.report()?.daily ?? [];
    const w = 720;
    const h = 220;
    const top = 10;
    const bottom = 20;
    const plot = h - top - bottom;
    const n = Math.max(days.length, 1);
    const step = w / n;
    const maxMoney = Math.max(1, ...days.map((d) => d.collectedHalalas));
    const maxCount = Math.max(1, ...days.map((d) => d.bookings));
    const locale = this.lang.current() === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
    const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const every = Math.ceil(n / 10);
    return {
      w,
      h,
      grid: [0, 0.5, 1].map((f) => ({ y: top + plot * f })),
      bars: days.map((d, i) => {
        const bh = (d.collectedHalalas / maxMoney) * plot;
        return { x: i * step + step * 0.2, y: top + plot - bh, bw: step * 0.6, bh, label: `${d.date}: ${toSar(d.collectedHalalas)} SAR` };
      }),
      line: days.map((d, i) => `${i * step + step / 2},${top + plot - (d.bookings / maxCount) * plot}`).join(' '),
      labels: days
        .map((d, i) => ({
          x: i * step + step / 2,
          text: fmt.format(new Date(d.date + 'T12:00:00Z')),
          i,
          anchor: i === 0 ? 'start' : i >= n - every ? 'end' : 'middle',
        }))
        .filter((l) => l.i % every === 0),
    };
  });

  ngOnInit(): void {
    this.applyPreset();
  }

  applyPreset(): void {
    const now = new Date();
    if (this.preset === 'month') {
      // Whole month, so visits scheduled later this month (already booked or completed) are included.
      this.load(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (this.preset === 'lastMonth') {
      this.load(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (this.preset === 'days30') {
      this.load(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), now);
    }
  }

  onRange(): void {
    if (this.range?.[0] && this.range[1]) {
      this.load(this.range[0], this.range[1]);
    }
  }

  pct(part: number, total: number): number {
    return total ? Math.round((part / total) * 100) : 0;
  }

  share(v: number, max: number): number {
    return Math.max(2, Math.round((v / max) * 100));
  }

  exportCsv(): void {
    const r = this.report();
    if (!r) return;
    const rows = [['date', 'bookings', 'completed', 'invoiced_sar', 'collected_sar']];
    for (const d of r.daily) {
      rows.push([d.date, String(d.bookings), String(d.completed), toSar(d.invoicedHalalas).toFixed(2), toSar(d.collectedHalalas).toFixed(2)]);
    }
    const csv = '﻿' + rows.map((x) => x.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${r.from}-${r.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  private load(from: Date, to: Date): void {
    this.report.set(null);
    this.http.get<ReportSummary>('/api/v1/reports/summary', { params: { from: iso(from), to: iso(to) } }).subscribe({
      next: (r) => this.report.set(r),
      error: (e) => this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) }),
    });
  }
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
