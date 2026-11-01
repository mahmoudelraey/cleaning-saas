import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, filter, forkJoin, interval, of, startWith, switchMap } from 'rxjs';

import { BookingSummary, NotificationLog, Page } from '../core/api.types';
import { LocalDatePipe } from '../shared/local-date.pipe';

type Kind = 'new' | 'unassigned' | 'failed';

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
 * "Needs attention" list for the office, built from existing data (no separate notifications store):
 * booking-page orders waiting for confirmation, visits in the next 48h with no technician, and customer
 * messages that failed this week. An item disappears once it's handled; the red dot marks unseen ones.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [TranslatePipe, LocalDatePipe],
  styles: `
    :host { position: relative; display: block; }
    .bell { position: relative; width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--fo-border); background: var(--fo-surface);
            display: grid; place-items: center; cursor: pointer; color: var(--fo-text); transition: background .15s; }
    .bell:hover { background: var(--fo-bg); }
    .bell i { font-size: 1.05rem; }
    .count { position: absolute; top: -5px; inset-inline-end: -5px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
             background: var(--p-red-500); color: #fff; font-size: .68rem; font-weight: 700; display: grid; place-items: center;
             border: 2px solid var(--fo-surface); }
    .count.seen { background: var(--fo-muted); }
    .panel { position: absolute; top: calc(100% + 8px); inset-inline-end: 0; width: min(360px, 92vw); z-index: 30; background: var(--fo-surface);
             border: 1px solid var(--fo-border); border-radius: 14px; box-shadow: 0 16px 40px -12px rgba(15, 23, 42, .25); overflow: hidden; }
    .head { display: flex; justify-content: space-between; align-items: center; padding: .8rem 1rem; border-bottom: 1px solid var(--fo-border); }
    .head strong { font-size: .95rem; }
    .head small { color: var(--fo-muted); font-size: .75rem; }
    .list { max-height: 400px; overflow-y: auto; }
    .item { display: flex; gap: .7rem; align-items: flex-start; width: 100%; padding: .75rem 1rem; border: 0; border-bottom: 1px solid var(--fo-border);
            background: none; font: inherit; text-align: start; cursor: pointer; color: var(--fo-text); }
    .item:last-child { border-bottom: 0; }
    .item:hover { background: var(--fo-bg); }
    .item.unseen { background: color-mix(in srgb, var(--p-primary-500) 5%, transparent); }
    .ic { width: 34px; height: 34px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: .85rem;
          color: var(--t); background: color-mix(in srgb, var(--t) 13%, transparent); }
    .txt { flex: 1; min-width: 0; }
    .txt strong { display: block; font-size: .86rem; }
    .txt span { display: block; font-size: .8rem; color: var(--fo-muted); margin-top: .1rem; }
    .txt time { display: block; font-size: .72rem; color: var(--fo-muted); margin-top: .2rem; }
    .empty { padding: 2rem 1rem; text-align: center; color: var(--fo-muted); font-size: .88rem; }
    .empty i { display: block; font-size: 1.6rem; color: var(--p-green-500); margin-bottom: .5rem; }
  `,
  template: `
    <button type="button" class="bell" (click)="toggle()" [attr.aria-label]="'bell.title' | translate" [attr.aria-expanded]="open()">
      <i class="pi pi-bell"></i>
      @if (alerts().length) {
        <span class="count" [class.seen]="!unseenCount()">{{ alerts().length > 9 ? '9+' : alerts().length }}</span>
      }
    </button>

    @if (open()) {
      <div class="panel">
        <div class="head">
          <strong>{{ 'bell.title' | translate }}</strong>
          <small>{{ 'bell.subtitle' | translate }}</small>
        </div>
        <div class="list">
          @for (a of alerts(); track a.key) {
            <button type="button" class="item" [class.unseen]="isUnseen(a)" (click)="go(a)">
              <span class="ic" [style.--t]="tone(a.kind)"><i [class]="icon(a.kind)"></i></span>
              <span class="txt">
                <strong>{{ 'bell.' + a.kind | translate: { n: a.number } }}</strong>
                <span>{{ a.kind === 'failed' ? ('templates.' + a.template | translate) + ' · ' + a.customer : a.customer }}</span>
                <time>{{ a.at | ldate: 'medium' }}</time>
              </span>
            </button>
          } @empty {
            <div class="empty"><i class="pi pi-check-circle"></i>{{ 'bell.allClear' | translate }}</div>
          }
        </div>
      </div>
    }
  `,
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

  ngOnInit(): void {
    // Poll every minute and after each navigation (e.g. right after confirming an order).
    const navigations = this.router.events.pipe(filter((e) => e instanceof NavigationEnd));
    interval(POLL_MS)
      .pipe(startWith(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh());
    navigations.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refresh());
  }

  private refresh(): void {
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
      this.markSeen();
    }
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
