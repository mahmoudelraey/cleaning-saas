import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

/**
 * How customers reach FieldOps sales/support to activate a paid plan (no online payment yet). Set by the platform
 * owner in Platform → Settings and served by GET /api/v1/platform-info; WhatsApp in international format without
 * "+" (e.g. 9665XXXXXXXX). Empty = hidden.
 */
export interface SupportContact {
  whatsapp: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class SupportContactService {
  private readonly http = inject(HttpClient);
  private loaded = false;

  readonly contact = signal<SupportContact>({ whatsapp: '', email: '' });

  /** Loads once per session; failures keep the contact hidden. */
  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.http.get<{ supportWhatsapp?: string | null; supportEmail?: string | null }>('/api/v1/platform-info').subscribe({
      next: (i) => this.contact.set({ whatsapp: i.supportWhatsapp ?? '', email: i.supportEmail ?? '' }),
      error: () => (this.loaded = false),
    });
  }
}
