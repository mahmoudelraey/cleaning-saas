import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BookingStatus } from '../../core/api.types';

// DTOs mirroring com.fieldops.app.analytics.AnalyticsDtos. Money is in halalas.

export type Compare = 'NONE' | 'PREVIOUS' | 'YEAR';
export type Granularity = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
export type RecordKind = 'REQUESTS' | 'REVENUE';

/** Filters shared by every dashboard; dates are yyyy-MM-dd (company time zone, inclusive). */
export interface AnalyticsQuery {
  from: string;
  to: string;
  regionId?: number | null;
  cityId?: number | null;
  serviceId?: string | null;
  status?: BookingStatus[];
  compare: Compare;
}

export interface Kpis {
  revenueHalalas: number;
  grossSalesHalalas: number;
  vatHalalas: number;
  invoices: number;
  collectedHalalas: number | null;
  requests: number;
  completed: number;
  pending: number;
  cancelled: number;
  noShow: number;
  customers: number;
  avgRevenuePerRequestHalalas: number;
  completionRate: number;
  cancellationRate: number;
  /** Owner only, and only when no region / city / service / status filter is applied. */
  salaryCostHalalas: number | null;
  otherExpensesHalalas: number | null;
  expensesHalalas: number | null;
  netProfitHalalas: number | null;
  profitMargin: number | null;
}

export interface Point {
  start: string;
  end: string;
  revenueHalalas: number;
  requests: number;
  completed: number;
  cancelled: number;
}

export interface StatusCount {
  status: BookingStatus;
  count: number;
}

export interface Overview {
  from: string;
  to: string;
  previousFrom: string | null;
  previousTo: string | null;
  current: Kpis;
  previous: Kpis | null;
  outstandingHalalas: number | null;
  granularity: Granularity;
  trend: Point[];
  previousTrend: Point[];
  statuses: StatusCount[];
  financials: boolean;
  narrowed: boolean;
}

export interface ServiceRow {
  serviceId: string;
  name: string;
  nameEn: string | null;
  active: boolean;
  requests: number;
  completed: number;
  cancelled: number;
  revenueHalalas: number;
  previousRevenueHalalas: number;
  share: number;
  unitCostHalalas: number | null;
  directCostHalalas: number | null;
  profitHalalas: number | null;
  margin: number | null;
}

export interface ServiceAnalytics {
  services: ServiceRow[];
  revenueHalalas: number;
  unassignedRevenueHalalas: number;
  financials: boolean;
}

export interface RegionRow {
  regionId: number | null;
  code: string;
  nameAr: string;
  nameEn: string;
  requests: number;
  completed: number;
  cancelled: number;
  revenueHalalas: number;
  share: number;
}

export interface CityRow {
  cityId: number;
  regionId: number | null;
  nameAr: string;
  nameEn: string;
  requests: number;
  revenueHalalas: number;
}

export interface ServiceRef {
  serviceId: string;
  name: string;
  nameEn: string | null;
}

export interface Cell {
  regionId: number | null;
  /** null = all other services. */
  serviceId: string | null;
  requests: number;
}

export interface RegionAnalytics {
  regions: RegionRow[];
  cities: CityRow[];
  topServices: ServiceRef[];
  matrix: Cell[];
  unknownRequests: number;
  unknownRevenueHalalas: number;
}

export interface HeatCell {
  /** 0 = Sunday … 6 = Saturday. */
  dow: number;
  hour: number;
  requests: number;
}

export interface SeasonCell {
  year: number;
  month: number;
  requests: number;
  revenueHalalas: number;
}

export interface TimeAnalytics {
  granularity: Granularity;
  series: Point[];
  heatmap: HeatCell[];
  seasonal: SeasonCell[];
}

export interface PeriodRow {
  key: string;
  start: string;
  end: string;
  revenueHalalas: number;
  grossSalesHalalas: number;
  requests: number;
  completed: number;
  previousRevenueHalalas: number;
}

export interface Sales {
  from: string;
  to: string;
  current: Kpis;
  previous: Kpis | null;
  months: PeriodRow[];
  quarters: PeriodRow[];
  years: PeriodRow[];
  services: ServiceAnalytics;
  regions: RegionRow[];
  cities: CityRow[];
  financials: boolean;
}

export interface RecordRow {
  id: string;
  kind: RecordKind;
  number: number;
  date: string;
  customerName: string;
  services: string | null;
  cityAr: string | null;
  cityEn: string | null;
  status: string;
  amountHalalas: number;
  bookingId: string | null;
  bookingNumber: number | null;
  invoiceNumber: number | null;
}

export interface RecordPage {
  items: RecordRow[];
  page: number;
  size: number;
  total: number;
  totalAmountHalalas: number;
}

/** What a chart click drills into. */
export interface DrillQuery {
  title: string;
  kind: RecordKind;
  query: AnalyticsQuery;
  dow?: number;
  hour?: number;
}

const BASE = '/api/v1/analytics';

export function queryParams(q: AnalyticsQuery, extra: Record<string, string | number | undefined | null> = {}): HttpParams {
  let p = new HttpParams().set('from', q.from).set('to', q.to).set('compare', q.compare);
  if (q.regionId != null) p = p.set('regionId', q.regionId);
  if (q.cityId != null) p = p.set('cityId', q.cityId);
  if (q.serviceId) p = p.set('serviceId', q.serviceId);
  for (const s of q.status ?? []) p = p.append('status', s);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, v);
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly http = inject(HttpClient);

  overview(q: AnalyticsQuery, granularity?: Granularity): Observable<Overview> {
    return this.http.get<Overview>(`${BASE}/overview`, { params: queryParams(q, { granularity }) });
  }

  services(q: AnalyticsQuery): Observable<ServiceAnalytics> {
    return this.http.get<ServiceAnalytics>(`${BASE}/services`, { params: queryParams(q) });
  }

  regions(q: AnalyticsQuery): Observable<RegionAnalytics> {
    return this.http.get<RegionAnalytics>(`${BASE}/regions`, { params: queryParams(q) });
  }

  time(q: AnalyticsQuery, granularity?: Granularity): Observable<TimeAnalytics> {
    return this.http.get<TimeAnalytics>(`${BASE}/time`, { params: queryParams(q, { granularity }) });
  }

  sales(q: AnalyticsQuery): Observable<Sales> {
    return this.http.get<Sales>(`${BASE}/sales`, { params: queryParams(q) });
  }

  records(d: DrillQuery, lang: string, page: number, size: number): Observable<RecordPage> {
    return this.http.get<RecordPage>(`${BASE}/records`, {
      params: queryParams(d.query, { kind: d.kind, dow: d.dow, hour: d.hour, lang, page, size }),
    });
  }

  export(q: AnalyticsQuery, format: 'XLSX' | 'PDF', lang: string): Observable<Blob> {
    return this.http.get(`${BASE}/export`, { params: queryParams(q, { format, lang }), responseType: 'blob' });
  }
}

/** Saves a downloaded file in the browser. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** yyyy-MM-dd of a local date. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Growth as a fraction, or null when there is nothing to compare with. */
export function growth(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
