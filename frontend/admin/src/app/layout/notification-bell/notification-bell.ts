import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, filter, forkJoin, interval, of, startWith, switchMap } from 'rxjs';

import { BookingSummary, NotificationLog, Page } from '../../core/api.types';
import { LocalDatePipe } from '../../shared/local-date.pipe';

type Kind = 'new' | 'unassigned' | 'failed';
type Tab = 'inbox' | 'attention';

/** A stored notification for this staff member (see the backend InboxService). */
interface InboxItem {
  id: string;
  kind: string;
  bookingId?: string;
  refId?: string;
  number?: number;
  actor?: string;
  createdAt: string;
  read: boolean;
}

const INBOX_ICON: Record<string, [string, string]> = {
  BOOKING_NEW: ['pi pi-calendar-plus', 'var(--p-blue-600)'],
  BOOKING_CANCELLED_BY_CUSTOMER: ['pi pi-calendar-times', 'var(--p-red-600)'],
  VISIT_COMPLETED: ['pi pi-check-circle', 'var(--p-green-600)'],
  CONTACT_NEW: ['pi pi-envelope', 'var(--p-primary-600)'],
  REVIEW_NEW: ['pi pi-star', 'var(--p-amber-600)'],
};

interface Alert {
  key: string;
  kind: Kind;
  at: string;
  bookingId?: string;
  number?: number;
  customer?: string;
  template?: string;
}

const POLL_MS = 60_000;
const SEEN_KEY = 'fo.bell.seen';

/**
 * The office bell, two tabs:
 * - Notifications: what happened (new portal booking, cancellation by a customer, visit completed by a technician,
 *   contact message, review), stored per person with read / unread. Polled; no push service.
 * - Needs attention: built from existing data — orders waiting for confirmation, visits in the next 48h with no
 *   technician, customer messages that failed this week. An item disappears once it's handled.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [TranslatePipe, LocalDatePipe],
  styleUrl: './notification-bell.scss',
  templateUrl: './notification-bell.html',
})
export class NotificationBell implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly open = signal(false);
  protected readonly alerts = signal<Alert[]>([]);
  private readonly seen = signal<Set<string>>(readSeen());
  protected readonly unseenCount = computed(() => this.alerts().filter((a) => !this.seen().has(a.key)).length);
  protected readonly tab = signal<Tab>('inbox');
  protected readonly inbox = signal<InboxItem[]>([]);
  protected readonly unread = signal(0);
  /** Unread notifications plus the needs-attention items. */
  protected readonly badge = computed(() => this.unread() + this.alerts().length);

  ngOnInit(): void {
    // Poll every minute and after each navigation (e.g. right after confirming an order).
    const navigations = this.router.events.pipe(filter((e) => e instanceof NavigationEnd));
    interval(POLL_MS)
      .pipe(startWith(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh());
    navigations.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refresh());
  }

  private refresh(): void {
    this.http
      .get<{ unread: number; items: InboxItem[] }>('/api/v1/inbox')
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => {
        if (r) {
          this.inbox.set(r.items);
          this.unread.set(r.unread);
        }
      });
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3_600_000);
    const weekAgo = now.getTime() - 7 * 86_400_000;
    forkJoin({
      fresh: this.http
        .get<Page<BookingSummary>>('/api/v1/bookings', { params: { status: 'NEW', size: 20, page: 0, order: 'asc' } })
        .pipe(catchError(() => of(null))),
      soon: this.http
        .get<Page<BookingSummary>>('/api/v1/bookings', {
          params: { status: 'CONFIRMED', from: now.toISOString(), to: in48h.toISOString(), size: 20, page: 0, order: 'asc' },
        })
        .pipe(catchError(() => of(null))),
      messages: this.http
        .get<Page<NotificationLog>>('/api/v1/notifications', { params: { size: 50, page: 0 } })
        .pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ fresh, soon, messages }) => {
        // Keep the previous list if everything failed (offline), rather than showing "all clear".
        if (!fresh && !soon && !messages) {
          return;
        }
        const list: Alert[] = [
          ...(fresh?.items ?? []).map((b): Alert => ({
            key: 'new-' + b.id, kind: 'new', at: b.scheduledStart, bookingId: b.id, number: b.number, customer: b.customerName,
          })),
          ...(soon?.items ?? [])
            .filter((b) => !b.technicians.length)
            .map((b): Alert => ({
              key: 'unassigned-' + b.id, kind: 'unassigned', at: b.scheduledStart, bookingId: b.id, number: b.number, customer: b.customerName,
            })),
          ...(messages?.items ?? [])
            .filter((m) => m.status === 'FAILED' && new Date(m.createdAt).getTime() > weekAgo)
            .map((m): Alert => ({
              key: 'failed-' + m.id, kind: 'failed', at: m.createdAt, bookingId: m.bookingId, customer: m.toPhone, template: m.template,
            })),
        ];
        this.alerts.set(list);
      });
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      // Open on what is new: notifications first, unless only the attention list has something.
      this.tab.set(this.unread() === 0 && this.unseenCount() > 0 ? 'attention' : 'inbox');
      if (this.tab() === 'attention') {
        this.markSeen();
      }
    }
  }

  protected openAttention(): void {
    this.tab.set('attention');
    this.markSeen();
  }

  protected inboxIcon(kind: string): [string, string] {
    return INBOX_ICON[kind] ?? ['pi pi-bell', 'var(--p-primary-600)'];
  }

  protected openItem(n: InboxItem): void {
    if (!n.read) {
      this.markRead(n);
      this.http.post(`/api/v1/inbox/${n.id}/read`, {}).subscribe({ error: () => {} });
    }
    this.open.set(false);
    const target =
      n.kind === 'CONTACT_NEW' ? ['/contact-requests'] : n.kind === 'REVIEW_NEW' ? ['/reviews'] : n.bookingId ? ['/bookings', n.bookingId] : null;
    if (target) {
      void this.router.navigate(target);
    }
  }

  protected readAll(): void {
    this.inbox.update((l) => l.map((x) => ({ ...x, read: true })));
    this.unread.set(0);
    this.http.post('/api/v1/inbox/read-all', {}).subscribe({ error: () => {} });
  }

  private markRead(n: InboxItem): void {
    this.inbox.update((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    this.unread.update((u) => Math.max(0, u - 1));
  }

  protected isUnseen(a: Alert): boolean {
    return !this.seen().has(a.key);
  }

  protected go(a: Alert): void {
    this.open.set(false);
    void this.router.navigate(a.bookingId ? ['/bookings', a.bookingId] : ['/messages']);
  }

  protected icon(k: Kind): string {
    return k === 'new' ? 'pi pi-inbox' : k === 'unassigned' ? 'pi pi-user-plus' : 'pi pi-exclamation-triangle';
  }

  protected tone(k: Kind): string {
    return k === 'new' ? 'var(--p-blue-600)' : k === 'unassigned' ? 'var(--p-amber-600)' : 'var(--p-red-600)';
  }

  /** Remember what was shown so the badge turns grey until something new arrives. Per browser only. */
  private markSeen(): void {
    // Keep only keys still in the list so storage doesn't grow forever.
    const keys = new Set(this.alerts().map((a) => a.key));
    this.seen.set(keys);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...keys]));
    } catch {
      // storage blocked: the dot just resets on reload
    }
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }
}

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
