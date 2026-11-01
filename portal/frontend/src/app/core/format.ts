import { Pipe, PipeTransform, inject } from '@angular/core';

import { Lang, LanguageService } from './language.service';

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');

type Preset = 'time' | 'day' | 'dayShort' | 'weekday' | 'full' | 'dateTime' | 'dayNum' | 'month';
const PRESETS: Record<Preset, Intl.DateTimeFormatOptions> = {
  time: { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' },
  day: { weekday: 'long', day: 'numeric', month: 'long' },
  dayShort: { day: 'numeric', month: 'short', year: 'numeric' },
  weekday: { weekday: 'short' },
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  dateTime: { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h12' },
  dayNum: { day: 'numeric' },
  month: { month: 'short' },
};

/** Gregorian, Latin digits, 12-hour clock with AM/PM or ص/م (same convention as the admin app). */
export function formatDate(value: string | Date, preset: Preset, lang: Lang, timeZone?: string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(locale(lang), timeZone ? { ...PRESETS[preset], timeZone } : PRESETS[preset])
    .formatToParts(d)
    .map((p) => (p.type === 'dayPeriod' ? p.value.toUpperCase() : p.value))
    .join('');
}

@Pipe({ name: 'ldate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly lang = inject(LanguageService);
  transform(value: string | Date | null | undefined, preset: Preset = 'dayShort'): string {
    return value ? formatDate(value, preset, this.lang.current()) : '';
  }
}

@Pipe({ name: 'sar', pure: false })
export class SarPipe implements PipeTransform {
  private readonly lang = inject(LanguageService);
  transform(halalas: number | null | undefined): string {
    return new Intl.NumberFormat(this.lang.current() === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA', {
      style: 'currency',
      currency: 'SAR',
      maximumFractionDigits: 2,
    }).format((halalas ?? 0) / 100);
  }
}

/** +966551234567 → 055 123 4567, isolated so the digits never flip inside Arabic text. */
@Pipe({ name: 'phone' })
export class PhonePipe implements PipeTransform {
  transform(e164: string | null | undefined): string {
    if (!e164) {
      return '';
    }
    const m = /^\+966(5\d)(\d{3})(\d{4})$/.exec(e164);
    return `⁦${m ? `0${m[1]} ${m[2]} ${m[3]}` : e164}⁩`;
  }
}

export const SAUDI_MOBILE = /^(?:\+?966|00966|0)?5\d{8}$/;
