import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';

import { BookingDetail, BookingStatus } from '../../../core/api.types';
import { errorMessage } from '../../../core/http/api-error';
import { BookingStatusTag } from '../../../shared/booking-status/booking-status';
import { PhonePipe } from '../../../shared/format';
import { LocalTimeRangePipe } from '../../../shared/local-date.pipe';
import { TenantService } from '../../../core/tenant.service';
import { BookingsApi } from '../../bookings/bookings.api';
import { PhotoGallery } from '../photo-gallery/photo-gallery';

/** One visit, from the technician's phone: status steps, photos, notes. */
@Component({
  selector: 'app-visit',
  imports: [FormsModule, RouterLink, TranslatePipe, Button, Textarea, BookingStatusTag, PhonePipe, LocalTimeRangePipe, PhotoGallery],
  styleUrl: './visit.page.scss',
  templateUrl: './visit.page.html',
})
export class VisitPage implements OnInit {
  private readonly api = inject(BookingsApi);
  private readonly tenants = inject(TenantService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  readonly id = input.required<string>();

  protected readonly booking = signal<BookingDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly photoCount = signal(0);
  protected note = '';

  protected readonly canPhoto = computed(() =>
    !this.tenants.locked('photos') &&
    ['ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'].includes(this.booking()?.status ?? ''),
  );
  protected readonly needsAfterPhoto = computed(
    () => this.booking()?.allowedTransitions.includes('COMPLETED') && this.photoCount() === 0,
  );

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.get(this.id()).subscribe({
      next: (b) => this.booking.set(b),
      error: (err) => {
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
        void this.router.navigate(['/today']);
      },
    });
  }

  move(t: BookingStatus): void {
    if (t === 'NO_SHOW') {
      this.confirm.confirm({
        message: this.translate.instant('bookings.confirmNoShow'),
        acceptLabel: this.translate.instant('bookingAction.NO_SHOW'),
        rejectLabel: this.translate.instant('common.cancel'),
        acceptButtonProps: { severity: 'danger' },
        accept: () => this.doMove(t),
      });
      return;
    }
    this.doMove(t);
  }

  private doMove(t: BookingStatus): void {
    this.busy.set(true);
    this.api.changeStatus(this.id(), t).subscribe({
      next: (b) => {
        this.booking.set(b);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  addNote(): void {
    const text = this.note.trim();
    if (!text) {
      return;
    }
    this.api.addNote(this.id(), text).subscribe({
      next: () => {
        this.note = '';
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
      },
      error: (err) => this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) }),
    });
  }
}
