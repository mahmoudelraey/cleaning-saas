import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { Menu } from 'primeng/menu';
import { SelectButton } from 'primeng/selectbutton';

import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { AnalyticsApi, AnalyticsQuery, HeatCell, RegionRow, isoDate, saveBlob } from './analytics.api';
import { countText, hourText, sarText } from './charts';

/** Requests by weekday × hour (company time zone). Darker = busier; click a cell for its bookings. */
@Component({
  selector: 'app-heatmap',
  imports: [TranslatePipe],
  styles: `
    .wrap { overflow-x: auto; }
    .grid { display: grid; gap: 3px; min-width: 560px; align-items: center; }
    .day { font-size: .78rem; color: var(--fo-muted); padding-inline-end: .4rem; white-space: nowrap; }
    .hour { font-size: .7rem; color: var(--fo-muted); text-align: center; }
    button.cell { all: unset; box-sizing: border-box; height: 26px; border-radius: 4px; cursor: pointer; background: #f1f5f9; }
    button.cell:focus-visible { outline: 2px solid var(--p-primary-600); outline-offset: 1px; }
    button.cell:hover { outline: 2px solid var(--p-primary-300); }
    button.cell.zero { cursor: default; }
    .scale { display: flex; align-items: center; gap: .4rem; font-size: .75rem; color: var(--fo-muted); margin-top: .6rem; }
    .scale span.sw { width: 18px; height: 10px; border-radius: 2px; display: inline-block; }
  `,
  template: `
    <div class="wrap">
      <div class="grid" [style.grid-template-columns]="'auto repeat(' + hours().length + ', minmax(18px, 1fr))'" role="grid" [attr.aria-label]="'analytics.heatmap' | translate">
        <span></span>
        @for (h of hours(); track h) {
          <span class="hour">{{ h % 3 === 0 ? hourLabel(h) : '' }}</span>
        }
        @for (d of days; track d) {
          <span class="day">{{ 'analytics.dow.' + d | translate }}</span>
          @for (h of hours(); track h) {
            @let v = value(d, h);
            <button type="button" class="cell" [class.zero]="!v" [style.background]="color(v)" [attr.title]="tip(d, h, v)" [attr.aria-label]="tip(d, h, v)"
                    (click)="v && pick.emit({ dow: d, hour: h })"></button>
          }
        }
      </div>
    </div>
    <div class="scale">
      <span>{{ 'analytics.fewer' | translate }}</span>
      @for (a of [0.12, 0.35, 0.6, 0.85, 1]; track a) {
        <span class="sw" [style.background]="'rgba(13, 148, 136, ' + a + ')'"></span>
      }
      <span>{{ 'analytics.more' | translate }}</span>
    </div>
  `,
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
  styles: `
    .map {
      display: grid; gap: 4px; direction: ltr;
      grid-template-columns: repeat(5, minmax(0, 1fr)); grid-auto-rows: minmax(58px, auto);
      grid-template-areas:
        "TB GO SH SH SQ"
        "MN HA QA QA SQ"
        "MN HA RD RD SQ"
        "MQ MQ RD RD SQ"
        "BA AS NG NG SQ"
        "GA AS . . .";
    }
    button.tile {
      all: unset; box-sizing: border-box; border-radius: 8px; padding: .4rem .5rem; cursor: pointer; display: flex; flex-direction: column;
      justify-content: space-between; gap: .2rem; min-width: 0; transition: transform .1s; border: 2px solid transparent;
    }
    button.tile:hover { transform: translateY(-1px); }
    button.tile:focus-visible { outline: 2px solid var(--p-primary-700); outline-offset: 2px; }
    button.tile.selected { border-color: var(--p-primary-800); }
    .name { font-size: .74rem; font-weight: 600; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; }
    .val { font-size: .8rem; font-variant-numeric: tabular-nums; direction: ltr; text-align: end; }
    .scale { display: flex; align-items: center; gap: .4rem; font-size: .75rem; color: var(--fo-muted); margin-top: .6rem; }
    .scale span.sw { width: 18px; height: 10px; border-radius: 2px; display: inline-block; }
  `,
  template: `
    <div class="map" role="list" [attr.aria-label]="'analytics.regionMap' | translate">
      @for (r of tiles(); track r.code) {
        <button type="button" class="tile" role="listitem" [style.grid-area]="r.code" [style.background]="r.bg" [style.color]="r.fg"
                [class.selected]="r.regionId === selected()" [attr.title]="r.title" [attr.aria-label]="r.title" (click)="pick.emit(r.regionId)">
          <span class="name" [attr.dir]="en() ? 'ltr' : 'rtl'">{{ r.name }}</span>
          <span class="val">{{ r.text }}</span>
        </button>
      }
    </div>
    <div class="scale">
      <span>{{ 'analytics.fewer' | translate }}</span>
      @for (a of [0.08, 0.3, 0.55, 0.8, 1]; track a) {
        <span class="sw" [style.background]="'rgba(13, 148, 136, ' + a + ')'"></span>
      }
      <span>{{ 'analytics.more' | translate }}</span>
    </div>
  `,
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
  imports: [FormsModule, TranslatePipe, Button, Menu, Dialog, DatePicker, SelectButton],
  styles: `
    .row { display: grid; gap: .75rem; }
    .actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1rem; }
  `,
  template: `
    <p-button icon="pi pi-download" [label]="'analytics.export' | translate" [outlined]="true" [loading]="busy()" (onClick)="menu.toggle($event)" />
    <p-menu #menu [model]="items()" [popup]="true" appendTo="body" />

    <p-dialog [header]="(period() === 'month' ? 'analytics.monthlyReport' : 'analytics.yearlyReport') | translate" [visible]="dialog()"
              (visibleChange)="dialog.set($event)" [modal]="true" [style]="{ width: '380px', maxWidth: '95vw' }" [draggable]="false">
      <div class="row">
        @if (period() === 'month') {
          <p-datepicker [(ngModel)]="month" view="month" dateFormat="yy-mm" [inline]="true" [maxDate]="today" />
        } @else {
          <p-datepicker [(ngModel)]="year" view="year" dateFormat="yy" [inline]="true" [maxDate]="today" />
        }
        <p-selectbutton [options]="formats" [(ngModel)]="format" optionLabel="label" optionValue="value" [allowEmpty]="false" />
      </div>
      <div class="actions">
        <p-button [text]="true" severity="secondary" [label]="'common.cancel' | translate" (onClick)="dialog.set(false)" />
        <p-button icon="pi pi-download" [label]="'analytics.download' | translate" [loading]="busy()" (onClick)="downloadPeriod()" />
      </div>
    </p-dialog>
  `,
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
