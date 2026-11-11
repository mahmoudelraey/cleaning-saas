import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';

import { GoogleCandidate, PublicPage, TenantInfo } from './api.types';
import { PlanFeatureKey } from './plan-features';
import { portalUrl } from './portal';

export interface TenantUpdate {
  name: string;
  /** English name; empty clears it. */
  nameEn?: string;
  phone?: string | null;
  vatNumber?: string | null;
  address?: string | null;
  /** English address; empty clears it. */
  addressEn?: string;
  commercialRegistration?: string | null;
  pricesIncludeVat?: boolean;
  autoInvoice?: boolean;
}

/** Current company (name, plan, trial) shown in the shell and settings. */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly http = inject(HttpClient);

  readonly tenant = signal<TenantInfo | null>(null);

  /** Features of the company's plan (from the server; the API enforces them too). */
  readonly features = computed(() => new Set<string>(this.tenant()?.plan?.features ?? []));

  has(feature: PlanFeatureKey): boolean {
    return this.features().has(feature);
  }

  /** True only once the plan is known and lacks the feature, so nothing flashes "locked" while loading. */
  locked(feature: PlanFeatureKey): boolean {
    return this.tenant() !== null && !this.has(feature);
  }

  private inflight?: Observable<TenantInfo>;

  /** The tenant, loading it once if needed (concurrent callers share one request). */
  ensureLoaded(): Observable<TenantInfo> {
    const t = this.tenant();
    if (t) {
      return of(t);
    }
    this.inflight ??= this.load().pipe(
      finalize(() => (this.inflight = undefined)),
      shareReplay(1),
    );
    return this.inflight;
  }

  readonly trialDaysLeft = computed(() => {
    const t = this.tenant();
    if (!t || t.status !== 'TRIAL' || !t.trialEndsAt) {
      return null;
    }
    const ms = new Date(t.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  });

  /** Public booking link; becomes a subdomain once DNS is set up (plan 3.1). */
  readonly bookingUrl = computed(() => {
    const t = this.tenant();
    return t ? `${location.origin}/book/${t.slug}` : '';
  });

  /** Customers sign in here to see their visits, book and download invoices. */
  readonly portalUrl = computed(() => {
    const t = this.tenant();
    return t ? portalUrl(t.slug) : '';
  });

  load(): Observable<TenantInfo> {
    return this.http.get<TenantInfo>('/api/v1/tenant').pipe(tap((t) => this.tenant.set(t)));
  }

  update(body: TenantUpdate): Observable<TenantInfo> {
    return this.http.put<TenantInfo>('/api/v1/tenant', body).pipe(tap((t) => this.tenant.set(t)));
  }

  searchGoogle(q: string, lang: string): Observable<GoogleCandidate[]> {
    return this.http.get<GoogleCandidate[]>('/api/v1/tenant/google/search', { params: { q, lang } });
  }

  /** Connect a Google Maps listing, or disconnect with null. */
  connectGoogle(placeId: string | null, name: string | null): Observable<TenantInfo> {
    return this.http.put<TenantInfo>('/api/v1/tenant/google', { placeId, name }).pipe(tap((t) => this.tenant.set(t)));
  }

  /** Mobile, WhatsApp and social accounts shown to customers. */
  updateContact(c: {
    phone: string | null;
    whatsapp: string | null;
    facebook: string | null;
    instagram: string | null;
    tiktok: string | null;
    snapchat: string | null;
    x: string | null;
  }): Observable<TenantInfo> {
    return this.http.put<TenantInfo>('/api/v1/tenant/contact', c).pipe(tap((t) => this.tenant.set(t)));
  }

  updatePublicPage(page: PublicPage): Observable<TenantInfo> {
    return this.http.put<TenantInfo>('/api/v1/tenant/public-page', page).pipe(tap((t) => this.tenant.set(t)));
  }

  /** Changes the company link (portal and booking page). Links shared before stop working. */
  changeSlug(slug: string): Observable<TenantInfo> {
    return this.http.put<TenantInfo>('/api/v1/tenant/slug', { slug }).pipe(tap((t) => this.tenant.set(t)));
  }

  updateBookingPage(enabled: boolean, note: string | null): Observable<TenantInfo> {
    return this.http
      .put<TenantInfo>('/api/v1/tenant/booking-page', { enabled, note })
      .pipe(tap((t) => this.tenant.set(t)));
  }

  uploadLogo(file: File): Observable<TenantInfo> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<TenantInfo>('/api/v1/tenant/logo', form).pipe(tap((t) => this.tenant.set(t)));
  }

  removeLogo(): Observable<TenantInfo> {
    return this.http.delete<TenantInfo>('/api/v1/tenant/logo').pipe(tap((t) => this.tenant.set(t)));
  }
}
