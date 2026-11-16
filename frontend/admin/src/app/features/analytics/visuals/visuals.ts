import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { AppDialog } from '../../../shared/dialog/dialog';
import { Menu } from 'primeng/menu';
import { SelectButton } from 'primeng/selectbutton';

import { errorMessage } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { AnalyticsApi, AnalyticsQuery, HeatCell, RegionRow, isoDate, saveBlob } from '../analytics.api';
import { countText, hourText, sarText } from '../charts';

/** Requests by weekday × hour (company time zone). Darker = busier; click a cell for its bookings. */
@Component({
  selector: 'app-heatmap',
  imports: [TranslatePipe],
  styleUrl: './visuals.heatmap.scss',
  templateUrl: './visuals.heatmap.html',
})
export class Heatmap {
  private readonly lang = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly cells = input.required<HeatCell[]>();
  readonly pick = output<{ dow: number; hour: number }>();

  /** Saudi week order: Sunday first. */
  protected readonly days = [0, 1, 2, 3, 4, 5, 6];
  private readonly map = computed(() => new Map(this.cells().map((c) => [c.dow * 24 + c.hour, c.requests])));
  private readonly max = computed(() => Math.max(1, ...this.cells().map((c) => c.requests)));
  /** Working hours only, widened to wherever there is data. */
  protected readonly hours = computed(() => {
    const used = this.cells().filter((c) => c.requests > 0).map((c) => c.hour);
    const from = Math.min(7, ...used);
    const to = Math.max(21, ...used);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });

  protected value(d: number, h: number): number {
    return this.map().get(d * 24 + h) ?? 0;
  }

  protected color(v: number): string {
    if (!v) return '#f1f5f9';
    return `rgba(13, 148, 136, ${0.12 + 0.88 * (v / this.max())})`;
  }

  protected hourLabel(h: number): string {
    return hourText(h, this.lang.current());
  }

  protected tip(d: number, h: number, v: number): string {
    return `${this.translate.instant('analytics.dow.' + d)} ${hourText(h, this.lang.current())}: ${this.translate.instant('analytics.nRequests', { n: countText(v, this.lang.current()) })}`;
  }
}

/**
 * Saudi Arabia's 13 regions as a tile map laid out roughly by geography (north at the top, the Red Sea on the
 * left), shaded by requests or revenue. Click a region to filter by it.
 */
@Component({
  selector: 'app-region-map',
  imports: [TranslatePipe],
  styleUrl: './visuals.region-map.scss',
  templateUrl: './visuals.region-map.html',
})
export class RegionMap {
  private readonly lang = inject(LanguageService);

  readonly regions = input.required<RegionRow[]>();
  readonly metric = input<'requests' | 'revenue'>('requests');
  readonly selected = input<number | null | undefined>(null);
  readonly pick = output<number | null>();

  protected readonly en = computed(() => this.lang.current() === 'en');
  protected readonly tiles = computed(() => {
    const lang = this.lang.current();
    const rows = this.regions().filter((r) => r.regionId != null);
    const val = (r: RegionRow) => (this.metric() === 'revenue' ? r.revenueHalalas : r.requests);
    const max = Math.max(1, ...rows.map(val));
    return rows.map((r) => {
      const v = val(r);
      const a = v ? 0.08 + 0.92 * (v / max) : 0;
      const name = lang === 'en' ? r.nameEn : r.nameAr.replace(/^منطقة\s+/, '');
      const text = this.metric() === 'revenue' ? sarText(v, lang, true) : countText(v, lang);
      return {
        ...r,
        name,
        text,
        title: `${name}: ${text}`,
        bg: v ? `rgba(13, 148, 136, ${a})` : '#f1f5f9',
        fg: a > 0.55 ? '#ffffff' : 'var(--fo-text)',
      };
    });
  });
}

/** Export menu: the current view to Excel or PDF, or the full report of a month or a year. */
@Component({
  selector: 'app-export-menu',
  imports: [FormsModule, TranslatePipe, Button, Menu, AppDialog, DatePicker, SelectButton],
  styleUrl: './visuals.export-menu.scss',
  templateUrl: './visuals.export-menu.html',
})
export class ExportMenu {
  private readonly api = inject(AnalyticsApi);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);
  private readonly messages = inject(MessageService);

  readonly query = input.required<AnalyticsQuery>();

  protected readonly busy = signal(false);
  protected readonly dialog = signal(false);
  protected readonly period = signal<'month' | 'year'>('month');
  protected readonly today = new Date();
  protected month = new Date();
  protected year = new Date();
  protected format: 'XLSX' | 'PDF' = 'PDF';
  protected readonly formats = [
    { value: 'PDF', label: 'PDF' },
    { value: 'XLSX', label: 'Excel' },
  ];

  protected readonly items = computed<MenuItem[]>(() => {
    this.lang.current();
    const t = (k: string) => this.translate.instant(k);
    return [
      { label: t('analytics.currentView'), items: [
        { label: t('analytics.excel'), icon: 'pi pi-file-excel', command: () => this.download(this.query(), 'XLSX') },
        { label: t('analytics.pdf'), icon: 'pi pi-file-pdf', command: () => this.download(this.query(), 'PDF') },
      ] },
      { label: t('analytics.fullReports'), items: [
        { label: t('analytics.monthlyReport'), icon: 'pi pi-calendar', command: () => this.openPeriod('month') },
        { label: t('analytics.yearlyReport'), icon: 'pi pi-calendar-plus', command: () => this.openPeriod('year') },
      ] },
    ];
  });

  private openPeriod(p: 'month' | 'year'): void {
    this.period.set(p);
    this.dialog.set(true);
  }

  protected downloadPeriod(): void {
    let from: Date;
    let to: Date;
    if (this.period() === 'month') {
      from = new Date(this.month.getFullYear(), this.month.getMonth(), 1);
      to = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 0);
    } else {
      from = new Date(this.year.getFullYear(), 0, 1);
      to = new Date(this.year.getFullYear(), 11, 31);
    }
    // A full report covers the whole business (no region / service / status filter), compared with the previous
    // month for monthly reports and with the year before for yearly ones.
    this.download(
      { from: isoDate(from), to: isoDate(to), compare: this.period() === 'year' ? 'YEAR' : 'PREVIOUS', status: [] },
      this.format,
      () => this.dialog.set(false),
    );
  }

  private download(q: AnalyticsQuery, format: 'XLSX' | 'PDF', done?: () => void): void {
    this.busy.set(true);
    this.api.export(q, format, this.lang.current()).subscribe({
      next: (blob) => {
        saveBlob(blob, `fieldops-report-${q.from}_${q.to}.${format === 'PDF' ? 'pdf' : 'xlsx'}`);
        this.busy.set(false);
        done?.();
      },
      error: (e) => {
        this.busy.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }
}
