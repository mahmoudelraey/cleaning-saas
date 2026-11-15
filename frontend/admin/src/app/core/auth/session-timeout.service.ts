import { DestroyRef, Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ACTIVITY_KEY, AuthService, STORAGE_KEY } from './auth.service';

/** User actions that count as "still here". */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
/** Activity is written at most this often (localStorage is shared by every tab). */
const WRITE_EVERY_MS = 15_000;
/** How often the idle time is checked. */
const CHECK_EVERY_MS = 20_000;

/**
 * Signs the user out after a period without activity (IDLE_LIMIT_MS in auth.service). Activity in any tab keeps
 * every tab signed in; signing out in one tab signs out the others. Listens outside Angular so mouse and key
 * events don't trigger change detection.
 */
@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private lastWrite = 0;
  private started = false;

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    const onActivity = () => {
      const now = Date.now();
      if (!this.auth.isLoggedIn() || now - this.lastWrite < WRITE_EVERY_MS) return;
      // Back after the limit (e.g. laptop woke up): sign out instead of quietly extending the session.
      if (this.auth.isIdleExpired()) {
        this.expire();
        return;
      }
      this.lastWrite = now;
      this.auth.touch();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.check();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        this.zone.run(() => {
          const wasIn = this.auth.isLoggedIn();
          this.auth.syncFromStorage();
          if (wasIn && !this.auth.isLoggedIn()) void this.router.navigate(['/login']);
        });
      } else if (e.key === ACTIVITY_KEY) {
        this.lastWrite = Date.now();
      }
    };

    this.zone.runOutsideAngular(() => {
      ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true, capture: true }));
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('storage', onStorage);
      const timer = setInterval(() => this.check(), CHECK_EVERY_MS);
      this.destroyRef.onDestroy(() => {
        ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true }));
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('storage', onStorage);
        clearInterval(timer);
      });
    });
  }

  private check(): void {
    if (this.auth.isLoggedIn() && this.auth.isIdleExpired()) this.expire();
  }

  private expire(): void {
    this.zone.run(() => this.auth.logout('idle'));
  }
}
