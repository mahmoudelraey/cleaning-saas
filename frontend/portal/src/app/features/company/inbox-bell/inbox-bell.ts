import { Component, DestroyRef, ElementRef, HostListener, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, filter, interval, merge, of, startWith, switchMap } from 'rxjs';

import { InboxItem } from '../../../core/api.types';
import { LocalDatePipe } from '../../../core/format';
import { PortalApi } from '../../../core/portal.api';

const POLL_MS = 60_000;

const ICON: Record<string, string> = {
  BOOKING_CONFIRMED: 'pi pi-check-circle',
  TECHNICIAN_ASSIGNED: 'pi pi-user',
  BOOKING_RESCHEDULED: 'pi pi-clock',
  BOOKING_CANCELLED: 'pi pi-times-circle',
  TECHNICIAN_ON_THE_WAY: 'pi pi-car',
  VISIT_DONE: 'pi pi-star',
  INVOICE_ISSUED: 'pi pi-receipt',
  QUOTE_SENT: 'pi pi-file-edit',
};

/**
 * The signed-in customer's notifications from this company: confirmations, new times, the team on its way, a
 * finished visit, a new invoice or quote. Checked every minute and after each page change; no push service.
 */
@Component({
  selector: 'pt-inbox-bell',
  imports: [TranslatePipe, LocalDatePipe],
  styleUrl: './inbox-bell.scss',
  templateUrl: './inbox-bell.html',
})
export class InboxBell implements OnInit {
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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
    if (n.kind === 'QUOTE_SENT' && n.refId) {
      void this.router.navigate(['/', slug, 'quotes', n.refId]);
    } else if (n.kind === 'INVOICE_ISSUED') {
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

  /*
   * A click anywhere outside the bell and its list closes it. (A full-page backdrop can't do this here: the header
   * uses backdrop-filter, which keeps fixed elements inside the header's own box.)
   */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }
}
