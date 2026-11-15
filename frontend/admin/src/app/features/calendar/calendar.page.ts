import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { SelectButton } from 'primeng/selectbutton';

import { CalendarData } from '../../core/api.types';
import { LanguageService } from '../../core/i18n/language.service';
import { STATUS_COLOR } from '../../shared/booking-status/booking-status';
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
  styleUrl: './calendar.page.scss',
  templateUrl: './calendar.page.html',
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
