import { Lang } from '../../core/i18n/language.service';
import { toSar } from '../../shared/format';

/**
 * Chart.js settings shared by every dashboard so charts read as one system: one categorical palette
 * (primary teal first), green for growth, red for decline, the app font, tooltips with SAR amounts and
 * 12-hour times in the reader's language.
 */

/** Categorical palette, teal first (matches the PrimeNG primary). */
export const PALETTE = ['#0d9488', '#f59e0b', '#6366f1', '#ec4899', '#0ea5e9', '#84cc16', '#a855f7', '#f97316'];
export const OTHER_COLOR = '#cbd5e1';
export const POSITIVE = '#16a34a';
export const NEGATIVE = '#dc2626';
export const MUTED = '#94a3b8';
const GRID = '#eef2f6';
const TEXT = '#64748b';

/** Booking status colours, as on the bookings list (green done, red cancelled, grey no-show, …). */
export const STATUS_COLORS: Record<string, string> = {
  NEW: '#0ea5e9',
  CONFIRMED: '#6366f1',
  ASSIGNED: '#a855f7',
  ON_THE_WAY: '#f59e0b',
  IN_PROGRESS: '#f97316',
  COMPLETED: '#16a34a',
  CANCELLED: '#dc2626',
  NO_SHOW: '#94a3b8',
};

export const FONT = "'IBM Plex Sans Arabic', system-ui, sans-serif";

export function locale(lang: Lang): string {
  return lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB';
}

/** 1234567 halalas → "12,345.67" (Latin digits in Arabic too, like the rest of the app). */
export function sarText(halalas: number, lang: Lang, compact = false): string {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA', {
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(toSar(halalas));
}

export function countText(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US').format(n);
}

export function pctText(fraction: number | null | undefined, lang: Lang, signed = false): string {
  if (fraction == null || !isFinite(fraction)) return '—';
  const s = new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(fraction);
  return s;
}

/** 0–23 → "9 AM" / "9 ص". */
export function hourText(h: number, lang: Lang): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? (lang === 'ar' ? 'ص' : 'AM') : lang === 'ar' ? 'م' : 'PM'}`;
}

/** Axis / tooltip label for a bucket starting on `start` (yyyy-MM-dd). */
export function bucketLabel(start: string, granularity: string, lang: Lang): string {
  const d = new Date(start + 'T12:00:00Z');
  const loc = locale(lang);
  switch (granularity) {
    case 'YEAR':
      return String(d.getUTCFullYear());
    case 'QUARTER':
      return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
    case 'MONTH':
      return new Intl.DateTimeFormat(loc, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
    default:
      return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
  }
}

export function monthName(month: number, lang: Lang, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(locale(lang), { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, month - 1, 15)));
}

/** Base options: responsive, app font, quiet grid, legend at the bottom, tooltips on hover (also touch). */
export function baseOptions(lang: Lang, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const rtl = lang === 'ar';
  return deepMerge(
    {
      responsive: true,
      maintainAspectRatio: false,
      locale: locale(lang),
      interaction: { mode: 'index', intersect: false },
      font: { family: FONT },
      plugins: {
        legend: {
          position: 'bottom',
          rtl,
          labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, color: TEXT, font: { family: FONT, size: 12 } },
        },
        tooltip: {
          rtl,
          textDirection: rtl ? 'rtl' : 'ltr',
          titleFont: { family: FONT },
          bodyFont: { family: FONT },
          padding: 10,
          boxPadding: 4,
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: TEXT, font: { family: FONT, size: 11 }, maxRotation: 0, autoSkipPadding: 12 } },
        y: { grid: { color: GRID }, border: { display: false }, ticks: { color: TEXT, font: { family: FONT, size: 11 } }, beginAtZero: true },
      },
    },
    extra,
  );
}

/** Money axis ticks in compact SAR and money tooltips for the datasets whose `yAxisID` is in `moneyAxes`. */
export function moneyAxis(lang: Lang): Record<string, unknown> {
  return {
    ticks: { callback: (v: number | string) => sarText(Number(v), lang, true) },
  };
}

export function moneyTooltip(lang: Lang, moneyDatasets: (number | string)[] | 'all' = 'all'): Record<string, unknown> {
  return {
    callbacks: {
      label: (ctx: { dataset: { label?: string; yAxisID?: string }; datasetIndex: number; parsed: { x: number; y: number }; raw: unknown }) => {
        const isMoney =
          moneyDatasets === 'all' ||
          moneyDatasets.includes(ctx.datasetIndex) ||
          (ctx.dataset.yAxisID !== undefined && moneyDatasets.includes(ctx.dataset.yAxisID));
        const raw = typeof ctx.raw === 'number' ? ctx.raw : ctx.parsed.y ?? ctx.parsed.x;
        const value = isMoney ? `${sarText(raw, lang)} ${lang === 'ar' ? 'ر.س' : 'SAR'}` : countText(raw, lang);
        return ` ${ctx.dataset.label ?? ''}: ${value}`;
      },
    },
  };
}

/** Hex colour with alpha (for fills). */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Index of the clicked element from PrimeNG's (onDataSelect) event. */
export function selectedIndex(e: { element?: { index?: number; datasetIndex?: number } }): { index: number; dataset: number } | null {
  const el = e?.element;
  return el && el.index != null ? { index: el.index, dataset: el.datasetIndex ?? 0 } : null;
}

function deepMerge<T extends Record<string, unknown>>(a: T, b: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && typeof v !== 'function' && cur && typeof cur === 'object' && !Array.isArray(cur)
        ? deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out as T;
}

export { deepMerge };

/** Amount with the currency, exactly as the `sar` pipe shows it elsewhere in the app. */
export function sarCurrency(halalas: number | null | undefined, lang: Lang): string {
  if (halalas == null) return '—';
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 2,
  }).format(toSar(halalas));
}
