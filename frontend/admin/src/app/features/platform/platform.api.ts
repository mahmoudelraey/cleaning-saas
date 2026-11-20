import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Role } from '../../core/api.types';

// DTOs mirroring com.fieldops.app.platform.PlatformService. Money in halalas; dates yyyy-MM-dd (Saudi days).

export type CompanyStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
export type CompanyFilter = CompanyStatus | 'TRIAL_EXPIRED' | 'ENDING_SOON' | '';
export type BillingCycle = 'MONTHLY' | 'YEARLY';

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  planId: string;
  status: CompanyStatus;
  /** Can the company's staff use the app right now. */
  usable: boolean;
  trialEndsAt: string | null;
  paidUntil: string | null;
  billingCycle: BillingCycle | null;
  statusNote: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  users: number;
  lastLoginAt: string | null;
}

export interface CompanyDetail {
  company: CompanyRow;
  staff: { id: string; name: string; phone: string; email: string | null; role: Role; active: boolean; lastLoginAt: string | null }[];
  history: { action: string; details: string | null; actorName: string | null; at: string }[];
  limits: CompanyLimits;
  google: CompanyGoogle;
}

/** The company's Google Maps listing (rating and reviews on its public page), connected from the platform. */
export interface CompanyGoogle {
  /** Google reviews are switched on in Platform → Settings with a key. */
  available: boolean;
  placeId: string | null;
  name: string | null;
}

export interface GooglePlace {
  placeId: string;
  name: string | null;
  address: string | null;
}

/** Plan values, this company's overrides (null = none), what applies now (null = unlimited) and this month's use. */
export interface CompanyLimits {
  planMaxTechnicians: number;
  planMonthlyMessages: number | null;
  planMonthlyBookings: number | null;
  maxTechniciansOverride: number | null;
  monthlyMessagesOverride: number | null;
  monthlyBookingsOverride: number | null;
  maxTechnicians: number;
  monthlyMessages: number | null;
  monthlyBookings: number | null;
  activeTechnicians: number;
  messagesThisMonth: number;
  bookingsThisMonth: number;
}

export interface LimitsInput {
  maxTechnicians: number | null;
  monthlyMessages: number | null;
  monthlyBookings: number | null;
}

export interface PlatformOverview {
  companies: number;
  trials: number;
  trialsExpired: number;
  trialsEndingSoon: number;
  active: number;
  pastDue: number;
  suspended: number;
  cancelled: number;
  newLast30Days: number;
  monthlyRecurringHalalas: number;
  byPlan: { planId: string; companies: number }[];
  endingSoon: CompanyRow[];
}

export interface PlanRow {
  id: string;
  nameAr: string;
  nameEn: string;
  priceMonthlyHalalas: number;
  priceYearlyHalalas: number | null;
  maxTechnicians: number;
  /** Automatic customer messages per month (OTP codes not counted); null = unlimited. */
  monthlyMessages: number | null;
  /** Bookings per month; null = unlimited. */
  monthlyBookings: number | null;
  features: string[];
  /** Offered to companies (shown in the plan picker). */
  active: boolean;
  sortOrder: number;
  companies: number;
}

export type PlanInput = Omit<PlanRow, 'companies'>;

export interface GeneralSettings {
  trialDays: number;
  trialPlanId: string;
  graceDays: number;
  supportWhatsapp: string | null;
  supportEmail: string | null;
}

export interface Secret {
  set: boolean;
  hint: string | null;
}

/** Google reviews for every company. */
export interface GoogleSettings {
  /** Switched on by the platform owner. */
  enabled: boolean;
  /** Key saved in the console (masked). */
  key: Secret;
  /** GOOGLE_PLACES_API_KEY is set on the server (used when no key is saved). */
  envKey: boolean;
  /** On and a key is available: companies see Google reviews. */
  active: boolean;
}

export type MessageChannel = 'WHATSAPP' | 'SMS';
export type ProviderType = 'META_WHATSAPP' | 'GUPSHUP_WHATSAPP' | 'TWILIO' | 'TAQNYAT_SMS' | 'UNIFONIC_SMS';

/** One provider setting. Secrets come back only as `saved` (masked), never with their value. */
export interface ProviderFieldView {
  key: string;
  /** The provider's own term, shown as-is. */
  label: string;
  secret: boolean;
  required: boolean;
  placeholder: string | null;
  value: string | null;
  saved: Secret | null;
}

export interface ProviderView {
  type: ProviderType;
  name: string;
  /** What it can carry; `activeChannels` = what it carries now (switched on and configured). */
  channels: MessageChannel[];
  activeChannels: MessageChannel[];
  enabled: boolean;
  /** Lower is tried first. */
  priority: number;
  /** false: never saved in the console (Meta / Unifonic still use the server's environment variables). */
  saved: boolean;
  ready: boolean;
  missing: string[];
  fields: ProviderFieldView[];
  usesTemplates: boolean;
  templates: Record<string, string>;
  updatedAt: string | null;
}

export interface MessagingView {
  providers: ProviderView[];
  templateKeys: string[];
  webhookPath: string;
  /** Providers tried per channel right now, first to last. */
  order: Record<MessageChannel, ProviderType[]>;
}

/** Secrets in `values`: absent/null keeps the saved value, '' clears it. */
export interface ProviderInput {
  enabled: boolean;
  priority: number;
  values: Record<string, string | null>;
  templates: Record<string, string>;
}

export interface TestResult {
  ok: boolean;
  message: string;
}

const BASE = '/api/platform';

@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly http = inject(HttpClient);

  overview(): Observable<PlatformOverview> {
    return this.http.get<PlatformOverview>(`${BASE}/overview`);
  }

  companies(q: string, status: CompanyFilter): Observable<CompanyRow[]> {
    const params: Record<string, string> = {};
    if (q.trim()) params['q'] = q.trim();
    if (status) params['status'] = status;
    return this.http.get<CompanyRow[]>(`${BASE}/companies`, { params });
  }

  company(id: string): Observable<CompanyDetail> {
    return this.http.get<CompanyDetail>(`${BASE}/companies/${id}`);
  }

  /** This company's own limits; null = the plan's value. */
  searchCompanyGoogle(id: string, q: string, lang: string): Observable<GooglePlace[]> {
    return this.http.get<GooglePlace[]>(`${BASE}/companies/${id}/google/search`, { params: { q, lang } });
  }

  /** Connect a Google Maps listing to the company, or disconnect with null. */
  setCompanyGoogle(id: string, placeId: string | null, name: string | null): Observable<CompanyDetail> {
    return this.http.put<CompanyDetail>(`${BASE}/companies/${id}/google`, { placeId, name });
  }

  setLimits(id: string, body: LimitsInput): Observable<CompanyDetail> {
    return this.http.put<CompanyDetail>(`${BASE}/companies/${id}/limits`, body);
  }

  changePlan(id: string, planId: string): Observable<CompanyDetail> {
    return this.http.put<CompanyDetail>(`${BASE}/companies/${id}/plan`, { planId });
  }

  trial(id: string, body: { days?: number; until?: string; endNow?: boolean }): Observable<CompanyDetail> {
    return this.http.post<CompanyDetail>(`${BASE}/companies/${id}/trial`, { endNow: false, ...body });
  }

  activate(id: string, planId: string, cycle: BillingCycle, paidUntil: string): Observable<CompanyDetail> {
    return this.http.post<CompanyDetail>(`${BASE}/companies/${id}/activate`, { planId, cycle, paidUntil });
  }

  suspend(id: string, note: string | null): Observable<CompanyDetail> {
    return this.http.post<CompanyDetail>(`${BASE}/companies/${id}/suspend`, { note });
  }

  reactivate(id: string): Observable<CompanyDetail> {
    return this.http.post<CompanyDetail>(`${BASE}/companies/${id}/reactivate`, {});
  }

  cancel(id: string, note: string | null): Observable<CompanyDetail> {
    return this.http.post<CompanyDetail>(`${BASE}/companies/${id}/cancel`, { note });
  }

  plans(): Observable<{ plans: PlanRow[]; features: string[] }> {
    return this.http.get<{ plans: PlanRow[]; features: string[] }>(`${BASE}/plans`);
  }

  createPlan(p: PlanInput): Observable<PlanRow> {
    return this.http.post<PlanRow>(`${BASE}/plans`, p);
  }

  updatePlan(id: string, p: PlanInput): Observable<PlanRow> {
    return this.http.put<PlanRow>(`${BASE}/plans/${id}`, p);
  }

  deletePlan(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/plans/${id}`);
  }

  general(): Observable<GeneralSettings> {
    return this.http.get<GeneralSettings>(`${BASE}/settings`);
  }

  saveGeneral(g: GeneralSettings): Observable<GeneralSettings> {
    return this.http.put<GeneralSettings>(`${BASE}/settings`, g);
  }

  google(): Observable<GoogleSettings> {
    return this.http.get<GoogleSettings>(`${BASE}/google`);
  }

  /** apiKey: null = keep the saved key, '' = remove it, text = replace it. */
  saveGoogle(enabled: boolean, apiKey: string | null): Observable<GoogleSettings> {
    return this.http.put<GoogleSettings>(`${BASE}/google`, { enabled, apiKey });
  }

  messaging(): Observable<MessagingView> {
    return this.http.get<MessagingView>(`${BASE}/messaging`);
  }

  saveProvider(type: ProviderType, body: ProviderInput): Observable<MessagingView> {
    return this.http.put<MessagingView>(`${BASE}/messaging/providers/${type}`, body);
  }

  /** Switches a provider on or off without touching its settings. */
  setProviderEnabled(type: ProviderType, enabled: boolean): Observable<MessagingView> {
    return this.http.put<MessagingView>(`${BASE}/messaging/providers/${type}/enabled`, { enabled });
  }

  testProvider(type: ProviderType, channel: MessageChannel, phone: string): Observable<TestResult> {
    return this.http.post<TestResult>(`${BASE}/messaging/providers/${type}/test`, { channel, phone });
  }
}

/** Status tag colour. */
export function statusSeverity(c: CompanyRow): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
  if (c.status === 'ACTIVE') return 'success';
  if (c.status === 'TRIAL') return c.usable ? 'info' : 'danger';
  if (c.status === 'PAST_DUE') return 'warn';
  if (c.status === 'SUSPENDED') return 'danger';
  return 'secondary';
}

/** Days from now to `iso` (negative when past), rounded up. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
