import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageService } from '../core/i18n/language.service';

/** Money is stored in halalas (integer) end to end; only the UI converts to riyals. */
export const toHalalas = (sar: number | null | undefined): number => Math.round((sar ?? 0) * 100);
export const toSar = (halalas: number | null | undefined): number => (halalas ?? 0) / 100;

@Pipe({ name: 'sar', pure: false })
export class SarPipe implements PipeTransform {
  private readonly lang = inject(LanguageService);

  transform(halalas: number | null | undefined): string {
    // Latin digits in Arabic too, matching phone numbers and times shown elsewhere.
    const locale = this.lang.current() === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'SAR', maximumFractionDigits: 2 }).format(
      toSar(halalas),
    );
  }
}

/** +966551234567 → 055 123 4567 (how people in KSA read numbers). */
@Pipe({ name: 'phone' })
export class PhonePipe implements PipeTransform {
  /**
   * @param isolate wrap in Unicode LTR isolate marks so the digits never flip inside Arabic text
   *   (button labels, tags). Pass false when the value goes into an input field.
   */
  transform(e164: string | null | undefined, isolate = true): string {
    if (!e164) {
      return '';
    }
    const m = /^\+966(5\d)(\d{3})(\d{4})$/.exec(e164);
    const text = m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
    return isolate ? `\u2066${text}\u2069` : text;
  }
}

/** Saudi mobile in any common local format (05…, 5…, +9665…, 009665…). Mirrors the backend rule. */
export const SAUDI_MOBILE_PATTERN = /^(?:\+?966|00966|0)?5\d{8}$/;
