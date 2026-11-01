import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, shareReplay, tap } from 'rxjs';

import { Role, Tokens, UserView } from '../api.types';

const STORAGE_KEY = 'fieldops.session';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: UserView;
}

export interface SignupForm {
  companyName: string;
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

  private readonly session = signal<StoredSession | null>(readStored());
  private refreshInFlight: Observable<string> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);
  readonly role = computed<Role | null>(() => this.session()?.user.role ?? null);
  readonly mustChangePassword = computed(() => !!this.session()?.user.mustChangePassword);

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  hasRole(...roles: Role[]): boolean {
    const r = this.role();
    return r !== null && roles.includes(r);
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

  logout(): void {
    const current = this.session();
    if (current) {
      // Best effort: revoke server-side, then forget locally regardless of the result.
      this.http.post('/api/v1/auth/logout', { refreshToken: current.refreshToken }).subscribe({ error: () => {} });
    }
    this.clear();
    void this.router.navigate(['/login']);
  }

  clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private store(t: Tokens): void {
    const s: StoredSession = { accessToken: t.accessToken, refreshToken: t.refreshToken, user: t.user };
    this.session.set(s);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable: session lasts for this tab only */
    }
  }
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}
