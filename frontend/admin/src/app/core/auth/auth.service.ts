import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';

import { DEFAULT_COORDINATOR_SCREENS, Role, Screen, Tokens, UserView } from '../api.types';

export const STORAGE_KEY = 'fieldops.session';
/** When the user last did something in any tab (ms since epoch), shared through localStorage. */
export const ACTIVITY_KEY = 'fieldops.lastActivity';

/** Signed out after this long without any activity: office staff 30 minutes, technicians in the field 8 hours. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;
export const TECHNICIAN_IDLE_LIMIT_MS = 8 * 60 * 60 * 1000;

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: UserView;
}

export interface SignupForm {
  companyName: string;
  companyNameEn: string;
  slug: string;
  ownerName: string;
  phone: string;
  email?: string;
  password: string;
}

/**
 * Holds the signed-in session as signals.
 *
 * MVP trade-off: tokens live in localStorage (simple, survives reloads, works for the PWA).
 * The access token is short-lived (15 min) and the API sends a strict CSP. Moving the refresh
 * token to an httpOnly cookie is on the hardening list (plan week 9).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly session = signal<StoredSession | null>(readStoredUnlessIdle());
  private refreshInFlight: Observable<string> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);
  readonly role = computed<Role | null>(() => this.session()?.user.role ?? null);
  readonly mustChangePassword = computed(() => !!this.session()?.user.mustChangePassword);

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  /** How long this user may stay idle before being signed out. */
  idleLimitMs(): number {
    return idleLimitFor(this.session()?.user.role ?? null);
  }

  /** Records activity now (shared with other tabs). */
  touch(): void {
    writeActivity(Date.now());
  }

  /** True when the session has been idle longer than allowed (activity in any tab counts). */
  isIdleExpired(): boolean {
    const last = readActivity();
    return last === null || Date.now() - last > this.idleLimitMs();
  }

  /** Another tab signed out or in: follow it. */
  syncFromStorage(): void {
    this.session.set(readStored());
  }

  hasRole(...roles: Role[]): boolean {
    const r = this.role();
    return r !== null && roles.includes(r);
  }

  /** Owners see every screen, technicians none of the office screens; coordinators what their owner allowed. */
  canSee(...anyOf: Screen[]): boolean {
    const r = this.role();
    if (r === 'OWNER') return true;
    if (r !== 'COORDINATOR') return false;
    const mine = this.user()?.screens ?? DEFAULT_COORDINATOR_SCREENS;
    return anyOf.some((s) => mine.includes(s));
  }

  /** Where this user starts: technicians their day, others the first screen they may open. */
  homePath(): string {
    if (this.hasRole('TECHNICIAN')) return '/today';
    if (this.hasRole('PLATFORM_ADMIN')) return '/platform';
    const order: [Screen, string][] = [
      ['DASHBOARD', '/dashboard'], ['CALENDAR', '/calendar'], ['BOOKINGS', '/bookings'], ['CUSTOMERS', '/customers'],
      ['INVOICES', '/invoices'], ['QUOTES', '/quotes'], ['MESSAGES', '/messages'], ['CONTACT_REQUESTS', '/contact-requests'],
      ['REVIEWS', '/reviews'], ['SERVICES', '/services'], ['TECHNICIANS', '/technicians'], ['REPORTS', '/reports'],
      ['SALES', '/sales'], ['EXPENSES', '/finance'],
    ];
    return order.find(([s]) => this.canSee(s))?.[1] ?? '/change-password';
  }

  login(identifier: string, password: string): Observable<UserView> {
    return this.http
      .post<Tokens>('/api/v1/auth/login', { identifier, password })
      .pipe(tap((t) => this.store(t)), map((t) => t.user));
  }

  signup(form: SignupForm): Observable<UserView> {
    return this.http
      .post<Tokens>('/api/v1/auth/signup', form)
      .pipe(tap((t) => this.store(t)), map((t) => t.user));
  }

  /** Replaces the user's password; the server signs out other devices and returns fresh tokens. */
  changePassword(currentPassword: string, newPassword: string): Observable<UserView> {
    return this.http
      .post<Tokens>('/api/v1/auth/change-password', { currentPassword, newPassword })
      .pipe(tap((t) => this.store(t)), map((t) => t.user));
  }

  /** Single-flight refresh: concurrent 401s share one refresh call. Emits the new access token. */
  refresh(): Observable<string> {
    const current = this.session();
    if (!current) {
      throw new Error('No session to refresh');
    }
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.http
        .post<Tokens>('/api/v1/auth/refresh', { refreshToken: current.refreshToken })
        .pipe(
          tap((t) => this.store(t)),
          map((t) => t.accessToken),
          finalize(() => (this.refreshInFlight = null)),
          shareReplay(1),
        );
    }
    return this.refreshInFlight;
  }

  /**
   * Signs out (revoking the refresh token on the server). With reason 'idle' the login page says why and brings
   * the user back to where they were.
   */
  logout(reason?: 'idle'): void {
    const current = this.session();
    if (current) {
      // Best effort: revoke server-side, then forget locally regardless of the result.
      this.http.post('/api/v1/auth/logout', { refreshToken: current.refreshToken }).subscribe({ error: () => {} });
    }
    this.clear();
    const here = this.router.url;
    const queryParams =
      reason === 'idle' ? { reason, ...(here && here !== '/' && !here.startsWith('/login') ? { next: here } : {}) } : {};
    void this.router.navigate(['/login'], { queryParams });
  }

  clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private store(t: Tokens): void {
    const s: StoredSession = { accessToken: t.accessToken, refreshToken: t.refreshToken, user: t.user };
    this.session.set(s);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      writeActivity(Date.now());
    } catch {
      /* storage unavailable: session lasts for this tab only */
    }
  }
}

function idleLimitFor(role: Role | null): number {
  return role === 'TECHNICIAN' ? TECHNICIAN_IDLE_LIMIT_MS : IDLE_LIMIT_MS;
}

function readActivity(): number | null {
  try {
    const v = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeActivity(at: number): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    /* storage unavailable */
  }
}

/**
 * The stored session, unless it has been idle too long (or has no activity record, e.g. one saved before the idle
 * timeout existed). Then it is dropped and its refresh token revoked, so the app opens on the login page.
 */
function readStoredUnlessIdle(): StoredSession | null {
  const s = readStored();
  if (!s) return null;
  const last = readActivity();
  if (last !== null && Date.now() - last <= idleLimitFor(s.user.role)) {
    return s;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    /* storage unavailable */
  }
  // Best effort (HttpClient isn't available yet): revoke the old refresh token on the server.
  fetch('/api/v1/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: s.refreshToken }),
    keepalive: true,
  }).catch(() => {});
  return null;
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}
