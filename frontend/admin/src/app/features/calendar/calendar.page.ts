import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { SelectButton } from 'primeng/selectbutton';

import { CalendarData } from '../../core/api.types';
import { LanguageService } from '../../core/i18n/language.service';
import { STATUS_COLOR } from '../../shared/booking-status';
import { BookingsApi } from '../bookings/bookings.api';
import { LocalDatePipe, LocalTimeRangePipe, formatLocalDate } from '../../shared/local-date.pipe';

type CalBooking = CalendarData['bookings'][number];
type View = 'day' | 'week';

interface Block {
  booking: CalBooking;
  top: number;
  height: number;
  left: number; // percent inside the column
  width: number; // percent
  color: string;
}

interface Column {
  key: string;
  title: string;
  subtitle?: string;
  color?: string;
  blocks: Block[];
}

const HOUR_PX = 56;

@Component({
  selector: 'app-calendar',
  imports: [FormsModule, RouterLink, TranslatePipe, Button, DatePicker, SelectButton, LocalDatePipe, LocalTimeRangePipe],
  styles: `
    .toolbar { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin-block-end: 1rem; }
    .toolbar .title { font-weight: 700; font-size: 1.1rem; margin-inline: .5rem; }
    .spacer { flex: 1; }
    .grid { display: grid; overflow-x: auto; background: var(--fo-surface); border: 1px solid var(--fo-border); border-radius: var(--fo-radius); }
    .head { position: sticky; top: 0; z-index: 2; background: var(--fo-surface); border-bottom: 1px solid var(--fo-border);
            padding: .6rem .5rem; font-weight: 600; font-size: .9rem; display: flex; gap: .4rem; align-items: center; min-height: 44px; }
    .head small { color: var(--fo-muted); font-weight: 400; }
    .hours { border-inline-end: 1px solid var(--fo-border); }
    .hour-label { height: 56px; font-size: .75rem; color: var(--fo-muted); text-align: center; padding-top: 2px; white-space: nowrap; }
    .col { position: relative; border-inline-end: 1px solid var(--fo-border); min-width: 0; }
    .col:last-child { border-inline-end: none; }
    .slot { height: 56px; border-bottom: 1px dashed var(--fo-border); }
    .block { position: absolute; border-radius: 8px; padding: 4px 6px; color: #fff; font-size: .78rem; overflow: hidden;
             cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.15); line-height: 1.3; text-decoration: none; }
    .block:hover { filter: brightness(1.05); box-shadow: 0 2px 6px rgba(0,0,0,.2); }
    .block strong { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .block .t { display: inline-block; opacity: .9; }
    .block.cancelled { opacity: .55; text-decoration: line-through; }
    .now { position: absolute; inset-inline: 0; height: 2px; background: var(--p-red-500); z-index: 1; }
    .legend { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: .75rem; font-size: .85rem; color: var(--fo-muted); }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'calendar.title' | translate }}</h1>
        <p>{{ 'calendar.subtitle' | translate }}</p>
      </div>
      <a routerLink="/bookings/new"><p-button icon="pi pi-plus" [label]="'bookings.new' | translate" /></a>
    </div>

    <div class="toolbar">
      <p-button icon="pi pi-chevron-right rtl-flip" [text]="true" [rounded]="true" (onClick)="shift(-1)" />
      <p-button [label]="'calendar.today' | translate" [outlined]="true" size="small" (onClick)="goToday()" />
      <p-button icon="pi pi-chevron-left rtl-flip" [text]="true" [rounded]="true" (onClick)="shift(1)" />
      <span class="title">
        @if (view() === 'day') {
          {{ anchor() | ldate: 'fullDate' }}
        } @else {
          {{ weekStart() | ldate: 'dayMonth' }} – {{ weekEnd() | ldate: 'dayMonthYear' }}
        }
      </span>
      <p-datepicker [ngModel]="anchor()" (ngModelChange)="setAnchor($event)" [showIcon]="true" [readonlyInput]="true" dateFormat="yy-mm-dd" styleClass="cal-picker" />
      <span class="spacer"></span>
      <p-selectbutton [options]="viewOptions()" [ngModel]="view()" (ngModelChange)="setView($event)" optionLabel="label" optionValue="value" [allowEmpty]="false" />
    </div>

    <div class="grid" [style.grid-template-columns]="gridTemplate()">
      <div class="hours">
        <div class="head"></div>
        @for (h of hours(); track h) {
          <div class="hour-label">{{ hourLabel(h) }}</div>
        }
      </div>
      @for (col of columns(); track col.key) {
        <div class="col">
          <div class="head">
            {{ col.title }} @if (col.subtitle) { <small>{{ col.subtitle }}</small> }
          </div>
          <div style="position: relative">
            @for (h of hours(); track h) { <div class="slot"></div> }
            @if (nowTop() !== null && isTodayColumn(col.key)) {
              <div class="now" [style.top.px]="nowTop()"></div>
            }
            @for (bl of col.blocks; track bl.booking.id) {
              <a
                class="block"
                [class.cancelled]="bl.booking.status === 'CANCELLED' || bl.booking.status === 'NO_SHOW'"
                [routerLink]="['/bookings', bl.booking.id]"
                [style.top.px]="bl.top"
                [style.height.px]="bl.height"
                [style.inset-inline-start.%]="bl.left"
                [style.width.%]="bl.width"
                [style.background]="bl.color"
                [title]="bl.booking.customerName"
              >
                <strong>#{{ bl.booking.number }} · {{ bl.booking.customerName }}</strong>
                <span class="t">{{ bl.booking.start | ltimeRange: bl.booking.end }}</span>
                @if (bl.height > 50 && bl.booking.addressText) { <div>{{ bl.booking.addressText }}</div> }
              </a>
            }
          </div>
        </div>
      }
    </div>

    <div class="legend">
      <span><span class="color-dot" [style.background]="statusColor.NEW"></span>{{ 'bookingStatus.NEW' | translate }}</span>
      <span><span class="color-dot" [style.background]="statusColor.CONFIRMED"></span>{{ 'calendar.unassigned' | translate }}</span>
      <span><span class="color-dot" [style.background]="statusColor.COMPLETED"></span>{{ 'bookingStatus.COMPLETED' | translate }}</span>
      <span>{{ 'calendar.legendTech' | translate }}</span>
    </div>
  `,
})
export class CalendarPage implements OnInit {
  private readonly api = inject(BookingsApi);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly lang = inject(LanguageService);

  protected readonly statusColor = STATUS_COLOR;
  protected readonly view = signal<View>(readView());
  protected readonly anchor = signal<Date>(startOfDay(new Date()));
  protected readonly data = signal<CalendarData | null>(null);
  protected readonly nowTick = signal(Date.now());

  protected readonly viewOptions = computed(() => [
    { value: 'day', label: this.translate.instant('calendar.day') },
    { value: 'week', label: this.translate.instant('calendar.week') },
  ]);

  /** Week starts on Sunday (Saudi work week). */
  protected readonly weekStart = computed(() => {
    const d = this.anchor();
    return addDays(d, -d.getDay());
  });
  protected readonly weekEnd = computed(() => addDays(this.weekStart(), 6));

  protected readonly hours = computed(() => {
    let first = 7;
    let last = 21;
    for (const b of this.data()?.bookings ?? []) {
      first = Math.min(first, new Date(b.start).getHours());
      const end = new Date(b.end);
      last = Math.max(last, end.getHours() + (end.getMinutes() > 0 ? 1 : 0) - 1);
    }
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  });

  protected readonly columns = computed<Column[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const firstHour = this.hours()[0];
    if (this.view() === 'day') {
      const unassigned = data.bookings.filter((b) => b.technicianIds.length === 0);
      const cols: Column[] = [
        {
          key: 'unassigned',
          title: this.translate.instant('calendar.unassigned'),
          subtitle: unassigned.length ? `(${unassigned.length})` : undefined,
          blocks: layout(unassigned, firstHour, (b) => STATUS_COLOR[b.status]),
        },
      ];
      for (const t of data.technicians.filter((x) => x.active || data.bookings.some((b) => b.technicianIds.includes(x.id)))) {
        const mine = data.bookings.filter((b) => b.technicianIds.includes(t.id));
        cols.push({
          key: t.id,
          title: t.name,
          blocks: layout(mine, firstHour, blockColor),
        });
      }
      return cols;
    }
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(this.weekStart(), i);
      const next = addDays(day, 1);
      const items = data.bookings.filter((b) => new Date(b.start) >= day && new Date(b.start) < next);
      return {
        key: dayKey(day),
        title: day.toLocaleDateString(this.translate.currentLang() === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { weekday: 'short' }),
        subtitle: String(day.getDate()),
        blocks: layout(items, firstHour, blockColor),
      };
    });
  });

  /** Left-hand hour labels: "9 AM" / "9 ص". */
  hourLabel(h: number): string {
    return formatLocalDate(new Date(2000, 0, 1, h), 'hour', this.lang.current());
  }

  protected readonly gridTemplate = computed(
    () => `56px repeat(${Math.max(this.columns().length, 1)}, minmax(${this.view() === 'week' ? 100 : 160}px, 1fr))`,
  );

  protected readonly nowTop = computed(() => {
    const now = new Date(this.nowTick());
    const first = this.hours()[0];
    const last = this.hours()[this.hours().length - 1];
    const h = now.getHours() + now.getMinutes() / 60;
    return h < first || h > last + 1 ? null : (h - first) * HOUR_PX;
  });

  ngOnInit(): void {
    this.load();
    setInterval(() => this.nowTick.set(Date.now()), 60_000);
  }

  isTodayColumn(key: string): boolean {
    const today = dayKey(startOfDay(new Date()));
    return this.view() === 'day' ? dayKey(this.anchor()) === today : key === today;
  }

  setView(v: View): void {
    this.view.set(v);
    try {
      localStorage.setItem('fieldops.calendarView', v);
    } catch {
      /* ignore */
    }
    this.load();
  }

  setAnchor(d: Date | null): void {
    if (d) {
      this.anchor.set(startOfDay(d));
      this.load();
    }
  }

  shift(direction: number): void {
    this.anchor.set(addDays(this.anchor(), direction * (this.view() === 'day' ? 1 : 7)));
    this.load();
  }

  goToday(): void {
    this.anchor.set(startOfDay(new Date()));
    this.load();
  }

  private load(): void {
    const from = this.view() === 'day' ? this.anchor() : this.weekStart();
    const to = addDays(from, this.view() === 'day' ? 1 : 7);
    this.api.calendar(from.toISOString(), to.toISOString(), true).subscribe((d) => this.data.set(d));
  }
}

/** Positions blocks; overlapping ones share the column width side by side. */
function layout(items: CalBooking[], firstHour: number, color: (b: CalBooking) => string): Block[] {
  const sorted = [...items].sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const lanes: number[] = []; // end time per lane
  const placed: { b: CalBooking; lane: number; group: number }[] = [];
  let group = 0;
  let groupEnd = 0;
  const groupLanes = new Map<number, number>();
  for (const b of sorted) {
    const s = +new Date(b.start);
    const e = +new Date(b.end);
    if (s >= groupEnd) {
      group++;
      lanes.length = 0;
    }
    let lane = lanes.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(e);
    } else {
      lanes[lane] = e;
    }
    groupEnd = Math.max(groupEnd, e);
    groupLanes.set(group, Math.max(groupLanes.get(group) ?? 0, lanes.length));
    placed.push({ b, lane, group });
  }
  return placed.map(({ b, lane, group: g }) => {
    const start = new Date(b.start);
    const end = new Date(b.end);
    const top = (start.getHours() + start.getMinutes() / 60 - firstHour) * HOUR_PX;
    const height = Math.max(((+end - +start) / 3_600_000) * HOUR_PX - 2, 22);
    const n = groupLanes.get(g) ?? 1;
    return { booking: b, top, height, left: (lane * 100) / n + 1, width: 100 / n - 2, color: color(b) };
  });
}

/** Bookings are colored by status (technicians no longer have their own color). */
function blockColor(b: CalBooking): string {
  return STATUS_COLOR[b.status];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readView(): View {
  try {
    return localStorage.getItem('fieldops.calendarView') === 'week' ? 'week' : 'day';
  } catch {
    return 'day';
  }
}
