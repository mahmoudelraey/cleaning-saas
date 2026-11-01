import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageService } from '../core/i18n/language.service';

export type DatePreset =
  | 'time'
  | 'hour'
  | 'mediumDate'
  | 'fullDate'
  | 'medium'
  | 'short'
  | 'dayMonth'
  | 'dayMonthYear'
  | 'weekdayDay'
  | 'weekdayShort';

/** Times are 12-hour everywhere: "2:30 PM" in English, "2:30 م" in Arabic. */
const H12: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' };

const PRESETS: Record<DatePreset, Intl.DateTimeFormatOptions> = {
  time: H12,
  hour: { hour: 'numeric', hourCycle: 'h12' },
  mediumDate: { day: 'numeric', month: 'short', year: 'numeric' },
  fullDate: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric', ...H12 },
  short: { day: '2-digit', month: '2-digit', year: 'numeric', ...H12 },
  dayMonth: { day: 'numeric', month: 'short' },
  dayMonthYear: { day: 'numeric', month: 'short', year: 'numeric' },
  weekdayDay: { weekday: 'short', day: 'numeric', month: 'short' },
  weekdayShort: { weekday: 'short' },
};

/**
 * Dates in the UI language (Arabic or English), Gregorian calendar, Latin digits, company time zone
 * (the browser's; the business runs in Riyadh).
 *
 * Don't wrap the output in `.ltr`: Arabic times end in ص/م and must flow right-to-left.
 */
@Pipe({ name: 'ldate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly lang = inject(LanguageService);

  transform(value: string | Date | null | undefined, preset: DatePreset = 'mediumDate'): string {
    const date = toDate(value);
    return date ? formatLocalDate(date, preset, this.lang.current()) : '';
  }
}

/** `{{ start | ltimeRange: end }}` → "9:00 AM – 11:30 AM" / "9:00 ص – 11:30 ص". */
@Pipe({ name: 'ltimeRange', pure: false })
export class LocalTimeRangePipe implements PipeTransform {
  private readonly lang = inject(LanguageService);

  transform(start: string | Date | null | undefined, end: string | Date | null | undefined): string {
    const s = toDate(start);
    const e = toDate(end);
    if (!s) {
      return '';
    }
    const lang = this.lang.current();
    return e ? `${formatLocalDate(s, 'time', lang)} – ${formatLocalDate(e, 'time', lang)}` : formatLocalDate(s, 'time', lang);
  }
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

export function formatLocalDate(date: Date, preset: DatePreset, lang: 'ar' | 'en', timeZone?: string): string {
  const locale = lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
  const options = timeZone ? { ...PRESETS[preset], timeZone } : PRESETS[preset];
  return new Intl.DateTimeFormat(locale, options)
    .formatToParts(date)
    // en-GB writes "am/pm"; show the usual "AM/PM". Arabic already gives ص/م.
    .map((p) => (p.type === 'dayPeriod' ? p.value.toUpperCase() : p.value))
    .join('');
}
