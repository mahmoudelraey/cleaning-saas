import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { BookingDetail, BookingEvent, BookingStatus, MyReview } from '../../../core/api.types';
import { CompanyStore } from '../../../core/company.store';
import { errorMessage } from '../../../core/errors';
import { LocalDatePipe, SarPipe } from '../../../core/format';
import { liveRefresh } from '../../../core/live-refresh';
import { PortalApi } from '../../../core/portal.api';
import { ToastService } from '../../../core/toast';
import { ItemTextPipe } from '../../../core/service-names';
import { RateVisit } from '../rate-visit/rate-visit';
import { VisitTracker } from '../../../shared/visit-tracker/visit-tracker';

@Component({
  selector: 'pt-booking-detail',
  imports: [FormsModule, RouterLink, TranslatePipe, LocalDatePipe, SarPipe, VisitTracker, RateVisit, ItemTextPipe],
  styleUrl: './booking-detail.page.scss',
  templateUrl: './booking-detail.page.html',
})
export class BookingDetailPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(ToastService);

  readonly id = input.required<string>();
  protected readonly detail = signal<BookingDetail | null>(null);
  protected readonly cancelOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly opening = signal(false);
  private readonly router = inject(Router);
  protected reason = '';

  ngOnInit(): void {
    this.load();
    // Status, technician and invoice change while the customer watches; quiet refresh, no error toasts.
    liveRefresh(this.destroyRef, () => this.load(true));
  }

  private load(quiet = false): void {
    this.api.booking(this.store.slug(), this.id()).subscribe({
      next: (d) => this.detail.set(d),
      error: (e) => {
        if (!quiet) this.toasts.show(errorMessage(e, this.translate), 'error');
      },
    });
  }

  protected reviewed(r: MyReview): void {
    this.detail.update((d) => (d ? { ...d, review: r } : d));
  }

  protected chipIcon(s: BookingStatus): string {
    if (s === 'NEW') return 'pi-clock';
    if (s === 'CANCELLED' || s === 'NO_SHOW') return 'pi-times-circle';
    return 'pi-check-circle';
  }

  protected techNames(): string {
    return (this.detail()?.booking.technicians ?? []).map((t) => t.name).join('، ');
  }

  protected eventText(e: BookingEvent): string {
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    switch (e.type) {
      case 'CREATED':
        return t('events.created');
      case 'ASSIGNED':
        return t('events.assigned', { names: e.note ?? '' });
      case 'RESCHEDULED':
        return t('events.rescheduled');
      case 'INVOICE_ISSUED':
        return t('events.invoice');
      default:
        return t('status.' + e.toStatus);
    }
  }

  cancel(): void {
    this.busy.set(true);
    this.api.cancel(this.store.slug(), this.id(), this.reason.trim() || null).subscribe({
      next: () => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.toasts.show(this.translate.instant('detail.cancelled'));
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toasts.show(errorMessage(e, this.translate), 'error');
      },
    });
  }

  /** The invoice opens inside the portal (with its PDF there). */
  openInvoice(id: string): void {
    void this.router.navigate(['/', this.store.slug(), 'invoices', id]);
  }
}
