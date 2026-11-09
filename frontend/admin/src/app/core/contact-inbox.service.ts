import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export type ContactTopic = 'BOOKING' | 'QUESTION' | 'QUOTE' | 'COMPLAINT' | 'OTHER';

export interface ContactMessage {
  id: string;
  customerId?: string;
  name: string;
  /** E.164 */
  phone: string;
  email?: string;
  topic: ContactTopic;
  message: string;
  status: 'NEW' | 'DONE';
  createdAt: string;
  handledAt?: string;
}

/** "Contact us" messages from the customer portal, and the count of new ones for the sidebar badge. */
@Injectable({ providedIn: 'root' })
export class ContactInboxService {
  private readonly http = inject(HttpClient);
  readonly newCount = signal(0);

  refreshCount(): void {
    this.http.get<{ count: number }>('/api/v1/contact-messages/count').subscribe({
      next: (r) => this.newCount.set(r.count),
      error: () => {},
    });
  }

  list(status: 'NEW' | 'DONE' | null): Observable<ContactMessage[]> {
    return this.http.get<ContactMessage[]>('/api/v1/contact-messages', { params: status ? { status } : {} });
  }

  setDone(id: string, done: boolean): Observable<ContactMessage> {
    return this.http
      .put<ContactMessage>(`/api/v1/contact-messages/${id}/done`, { done })
      .pipe(tap(() => this.newCount.update((n) => Math.max(0, n + (done ? -1 : 1)))));
  }
}
