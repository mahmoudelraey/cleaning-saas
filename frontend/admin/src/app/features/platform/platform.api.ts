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

export interface MessagingView {
  configured: boolean;
  whatsappEnabled: boolean;
  whatsappApiUrl: string;
  whatsappApiVersion: string;
  whatsappPhoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  whatsappAccessToken: Secret;
  whatsappAppSecret: Secret;
  whatsappVerifyToken: Secret;
  whatsappLanguage: string;
  whatsappTemplates: Record<string, string>;
  smsEnabled: boolean;
  smsApiUrl: string;
  smsAppSid: Secret;
  smsSenderId: string | null;
  webhookPath: string;
  templateKeys: string[];
  whatsappReady: boolean;
  smsReady: boolean;
  updatedAt: string | null;
}

/** Secrets: null keeps the saved value, '' clears it. */
export interface MessagingInput {
  whatsappEnabled: boolean;
  whatsappApiUrl: string | null;
  whatsappApiVersion: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  whatsappAccessToken: string | null;
  whatsappAppSecret: string | null;
  whatsappVerifyToken: string | null;
  whatsappLanguage: string | null;
  whatsappTemplates: Record<string, string>;
  smsEnabled: boolean;
  smsApiUrl: string | null;
  smsAppSid: string | null;
  smsSenderId: string | null;
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

  messaging(): Observable<MessagingView> {
    return this.http.get<MessagingView>(`${BASE}/messaging`);
  }

  saveMessaging(m: MessagingInput): Observable<MessagingView> {
    return this.http.put<MessagingView>(`${BASE}/messaging`, m);
  }

  test(channel: 'WHATSAPP' | 'SMS', phone: string): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(`${BASE}/messaging/test`, { channel, phone });
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
