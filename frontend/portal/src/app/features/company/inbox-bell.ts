import { Component, DestroyRef, HostListener, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, filter, interval, merge, of, startWith, switchMap } from 'rxjs';

import { InboxItem } from '../../core/api.types';
import { LocalDatePipe } from '../../core/format';
import { PortalApi } from '../../core/portal.api';

const POLL_MS = 60_000;

const ICON: Record<string, string> = {
  BOOKING_CONFIRMED: 'pi pi-check-circle',
  TECHNICIAN_ASSIGNED: 'pi pi-user',
  BOOKING_RESCHEDULED: 'pi pi-clock',
  BOOKING_CANCELLED: 'pi pi-times-circle',
  TECHNICIAN_ON_THE_WAY: 'pi pi-car',
  VISIT_DONE: 'pi pi-star',
  INVOICE_ISSUED: 'pi pi-receipt',
};

/**
 * The signed-in customer's notifications from this company: confirmations, new times, the team on its way, a
 * finished visit, a new invoice. Checked every minute and after each page change; no push service.
 */
@Component({
  selector: 'pt-inbox-bell',
  imports: [TranslatePipe, LocalDatePipe],
  styles: `
    :host { position: relative; display: block; }
    .bell { position: relative; width: 40px; height: 40px; border-radius: 50%; border: 0; background: var(--foam); color: var(--tide-deep);
            display: grid; place-items: center; cursor: pointer; }
    .bell:focus-visible { outline: 3px solid color-mix(in srgb, var(--tide) 45%, transparent); outline-offset: 2px; }
    .bell i { font-size: 1.05rem; }
    .count { position: absolute; top: -3px; inset-inline-end: -3px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
             background: var(--rose); color: #fff; font-size: .68rem; font-weight: 700; display: grid; place-items: center;
             border: 2px solid var(--surface); }
    .backdrop { position: fixed; inset: 0; z-index: 1; }
    .panel { position: absolute; top: calc(100% + 10px); inset-inline-end: -60px; width: min(340px, calc(100vw - 24px)); z-index: 2;
             background: var(--surface); border: 1px solid var(--line); border-radius: 18px; overflow: hidden;
             box-shadow: 0 22px 50px -20px rgba(15, 42, 61, .5); }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    .head strong { font-size: .95rem; }
    .read-all { border: 0; background: none; font: inherit; font-size: .8rem; color: var(--tide); cursor: pointer; padding: 0; }
    .list { max-height: min(420px, 60vh); overflow-y: auto; }
    .item { display: flex; gap: 12px; align-items: flex-start; width: 100%; padding: 12px 16px; border: 0; border-bottom: 1px solid var(--line);
            background: none; font: inherit; text-align: start; cursor: pointer; color: var(--ink); }
    .item:last-child { border-bottom: 0; }
    .item:hover { background: var(--mist); }
    .item.new { background: color-mix(in srgb, var(--foam) 45%, transparent); }
    .ic { width: 34px; height: 34px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--foam); color: var(--tide-deep); }
    .txt { flex: 1; min-width: 0; }
    .txt strong { display: block; font-size: .9rem; font-weight: 600; }
    .txt time { display: block; font-size: .76rem; color: var(--ink-3); margin-top: 2px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tide); flex: none; margin-top: 6px; }
    .empty { padding: 28px 16px; text-align: center; color: var(--ink-2); font-size: .9rem; }
    .empty i { display: block; font-size: 1.5rem; color: var(--ink-3); margin-bottom: 8px; }
    @media (max-width: 899px) { .panel { position: fixed; top: 64px; inset-inline: 12px; width: auto; } }
  `,
  template: `
    <button type="button" class="bell" (click)="toggle()" [attr.aria-label]="'inbox.title' | translate" [attr.aria-expanded]="open()">
      <i class="pi pi-bell" aria-hidden="true"></i>
      @if (unread() > 0) { <span class="count">{{ unread() > 9 ? '9+' : unread() }}</span> }
    </button>
    @if (open()) {
      <div class="backdrop" (click)="open.set(false)"></div>
      <div class="panel" role="dialog" [attr.aria-label]="'inbox.title' | translate">
        <div class="head">
          <strong>{{ 'inbox.title' | translate }}</strong>
          @if (unread() > 0) { <button type="button" class="read-all" (click)="readAll()">{{ 'inbox.readAll' | translate }}</button> }
        </div>
        <div class="list">
          @for (n of items(); track n.id) {
            <button type="button" class="item" [class.new]="!n.read" (click)="go(n)">
              <span class="ic"><i [class]="icon(n.kind)" aria-hidden="true"></i></span>
              <span class="txt">
                <strong>{{ 'inbox.kind.' + (n.kind === 'TECHNICIAN_ASSIGNED' && !n.actor ? 'TECHNICIAN_ASSIGNED_NONAME' : n.kind) | translate: { n: n.number, actor: n.actor } }}</strong>
                <time>{{ n.createdAt | ldate: 'dateTime' }}</time>
              </span>
              @if (!n.read) { <span class="dot" aria-hidden="true"></span> }
            </button>
          } @empty {
            <div class="empty"><i class="pi pi-bell" aria-hidden="true"></i>{{ 'inbox.empty' | translate }}</div>
          }
        </div>
      </div>
    }
  `,
})
export class InboxBell implements OnInit {
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly slug = input.required<string>();

  protected readonly open = signal(false);
  protected readonly items = signal<InboxItem[]>([]);
  protected readonly unread = signal(0);

  ngOnInit(): void {
    merge(interval(POLL_MS), this.router.events.pipe(filter((e) => e instanceof NavigationEnd)))
      .pipe(
        startWith(0),
        switchMap(() => this.api.inbox(this.slug()).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => {
        if (r) {
          this.items.set(r.items);
          this.unread.set(r.unread);
        }
      });
  }

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected icon(kind: string): string {
    return ICON[kind] ?? 'pi pi-bell';
  }

  protected go(n: InboxItem): void {
    if (!n.read) {
      this.items.update((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      this.unread.update((u) => Math.max(0, u - 1));
      this.api.readInbox(this.slug(), n.id).subscribe({ error: () => {} });
    }
    this.open.set(false);
    const slug = this.slug();
    if (n.kind === 'INVOICE_ISSUED') {
      void this.router.navigate(['/', slug, 'invoices']);
    } else if (n.bookingId) {
      void this.router.navigate(['/', slug, 'bookings', n.bookingId]);
    }
  }

  protected readAll(): void {
    this.items.update((l) => l.map((x) => ({ ...x, read: true })));
    this.unread.set(0);
    this.api.readAllInbox(this.slug()).subscribe({ error: () => {} });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }
}
