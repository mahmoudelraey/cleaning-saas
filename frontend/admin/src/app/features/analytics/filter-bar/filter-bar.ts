import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, model, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';

import { BookingStatus, ServiceOffering } from '../../../core/api.types';
import { GeoService } from '../../../core/geo.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AnalyticsQuery, Compare, isoDate } from '../analytics.api';

export type Preset = 'thisMonth' | 'lastMonth' | 'days30' | 'thisQuarter' | 'thisYear' | 'lastYear' | 'months12' | 'custom';

const STATUSES: BookingStatus[] = ['NEW', 'CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

/** The range a preset covers, as local dates. */
export function presetRange(p: Preset, now = new Date()): [Date, Date] | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p) {
    case 'thisMonth':
      // Whole month, so visits already booked for later this month are included (as before).
      return [new Date(y, m, 1), new Date(y, m + 1, 0)];
    case 'lastMonth':
      return [new Date(y, m - 1, 1), new Date(y, m, 0)];
    case 'days30':
      return [new Date(y, m, now.getDate() - 29), now];
    case 'thisQuarter': {
      const q = Math.floor(m / 3) * 3;
      return [new Date(y, q, 1), new Date(y, q + 3, 0)];
    }
    case 'thisYear':
      return [new Date(y, 0, 1), new Date(y, 11, 31)];
    case 'lastYear':
      return [new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)];
    case 'months12':
      return [new Date(y, m - 11, 1), new Date(y, m + 1, 0)];
    default:
      return null;
  }
}

export function defaultQuery(preset: Preset = 'thisMonth'): AnalyticsQuery {
  const [from, to] = presetRange(preset)!;
  return { from: isoDate(from), to: isoDate(to), compare: 'PREVIOUS', status: [] };
}

/**
 * Filters for every dashboard: period (presets or custom range), comparison period, region, city, service and
 * booking status. Two-way bound: `[(query)]`.
 */
@Component({
  selector: 'app-analytics-filters',
  imports: [FormsModule, TranslatePipe, Select, MultiSelect, DatePicker, Button],
  styleUrl: './filter-bar.scss',
  templateUrl: './filter-bar.html',
})
export class AnalyticsFilters implements OnInit {
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);
  private readonly geo = inject(GeoService);
  private readonly http = inject(HttpClient);

  readonly query = model.required<AnalyticsQuery>();
  readonly showCompare = input(true);
  readonly showService = input(true);
  readonly showStatus = input(true);

  protected readonly preset = signal<Preset>('thisMonth');
  protected readonly range = signal<Date[] | null>(null);
  protected readonly open = signal(false);

  private readonly regions = toSignal(this.geo.regions(), { initialValue: [] });
  private readonly cities = toSignal(this.geo.cities(), { initialValue: [] });
  private readonly services = toSignal(this.http.get<ServiceOffering[]>('/api/v1/services'), { initialValue: [] as ServiceOffering[] });

  private readonly en = computed(() => this.lang.current() === 'en');

  protected readonly presetOptions = computed(() => {
    this.lang.current();
    return (['thisMonth', 'lastMonth', 'days30', 'thisQuarter', 'thisYear', 'months12', 'lastYear', 'custom'] as Preset[]).map((p) => ({
      value: p,
      label: this.translate.instant('analytics.preset.' + p),
    }));
  });
  protected readonly compareOptions = computed(() => {
    this.lang.current();
    return (['PREVIOUS', 'YEAR', 'NONE'] as Compare[]).map((c) => ({ value: c, label: this.translate.instant('analytics.compare.' + c) }));
  });
  protected readonly regionOptions = computed(() =>
    this.regions().map((r) => ({ value: r.id, label: this.en() ? r.nameEn : r.nameAr })),
  );
  protected readonly cityOptions = computed(() => {
    const region = this.query().regionId;
    return this.cities()
      .filter((c) => region == null || c.regionId === region)
      .map((c) => ({ value: c.id, label: this.en() ? c.nameEn : c.nameAr }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });
  protected readonly serviceOptions = computed(() =>
    this.services().map((s) => ({ value: s.id, label: (this.en() && s.nameEn) || s.name })),
  );
  protected readonly statusOptions = computed(() => {
    this.lang.current();
    return STATUSES.map((s) => ({ value: s, label: this.translate.instant('bookingStatus.' + s) }));
  });
  protected readonly activeCount = computed(() => {
    const q = this.query();
    return (q.regionId != null ? 1 : 0) + (q.cityId != null ? 1 : 0) + (q.serviceId ? 1 : 0) + (q.status?.length ? 1 : 0);
  });

  ngOnInit(): void {
    // Show which preset the incoming range matches (custom otherwise).
    const q = this.query();
    const match = (this.presetOptions().map((o) => o.value) as Preset[]).find((p) => {
      const r = presetRange(p);
      return r && isoDate(r[0]) === q.from && isoDate(r[1]) === q.to;
    });
    this.preset.set(match ?? 'custom');
    if (!match) this.range.set([new Date(q.from + 'T00:00:00'), new Date(q.to + 'T00:00:00')]);
  }

  protected setPreset(p: Preset): void {
    this.preset.set(p);
    const r = presetRange(p);
    if (r) {
      this.patch({ from: isoDate(r[0]), to: isoDate(r[1]) });
    } else {
      const q = this.query();
      this.range.set([new Date(q.from + 'T00:00:00'), new Date(q.to + 'T00:00:00')]);
    }
  }

  protected onRange(r: Date[] | null): void {
    this.range.set(r);
    if (r?.[0] && r[1]) this.patch({ from: isoDate(r[0]), to: isoDate(r[1]) });
  }

  protected patch(p: Partial<AnalyticsQuery>): void {
    this.query.set({ ...this.query(), ...p });
  }

  protected clear(): void {
    this.patch({ regionId: null, cityId: null, serviceId: null, status: [] });
  }
}
