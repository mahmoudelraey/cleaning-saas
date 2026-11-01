import { Injectable, signal } from '@angular/core';

import { Session } from './api.types';

const KEY = (slug: string) => `pt.session.${slug.toLowerCase()}`;

/**
 * Sign-in per company link: a customer of two companies has two independent sessions.
 * The token lives in localStorage (30 days); it only opens the portal API, never the admin app.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly sessions = signal<Record<string, Session>>({});

  get(slug: string): Session | null {
    const key = slug.toLowerCase();
    const cached = this.sessions()[key];
    if (cached) {
      return this.valid(cached) ? cached : null;
    }
    try {
      const raw = localStorage.getItem(KEY(slug));
      if (!raw) {
        return null;
      }
      const s = JSON.parse(raw) as Session;
      if (!this.valid(s)) {
        localStorage.removeItem(KEY(slug));
        return null;
      }
      this.sessions.update((all) => ({ ...all, [key]: s }));
      return s;
    } catch {
      return null;
    }
  }

  set(slug: string, s: Session): void {
    this.sessions.update((all) => ({ ...all, [slug.toLowerCase()]: s }));
    try {
      localStorage.setItem(KEY(slug), JSON.stringify(s));
    } catch {
      // private mode: the session lasts until the tab closes
    }
  }

  /** After a profile change the server sends a new token (the name is inside it). */
  refreshToken(slug: string, token: string, expiresAt: string, name: string): void {
    const s = this.get(slug);
    if (s) {
      this.set(slug, { ...s, token, expiresAt, name });
    }
  }

  clear(slug: string): void {
    this.sessions.update((all) => {
      const next = { ...all };
      delete next[slug.toLowerCase()];
      return next;
    });
    try {
      localStorage.removeItem(KEY(slug));
    } catch {
      // ignore
    }
  }

  private valid(s: Session): boolean {
    return !!s.token && new Date(s.expiresAt).getTime() > Date.now() + 60_000;
  }
}
