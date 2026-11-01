import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';

import { BookingDetail, BookingStatus } from '../../core/api.types';
import { errorMessage } from '../../core/http/api-error';
import { BookingStatusTag } from '../../shared/booking-status';
import { PhonePipe } from '../../shared/format';
import { LocalTimeRangePipe } from '../../shared/local-date.pipe';
import { TenantService } from '../../core/tenant.service';
import { BookingsApi } from '../bookings/bookings.api';
import { PhotoGallery } from './photo-gallery';

/** One visit, from the technician's phone: status steps, photos, notes. */
@Component({
  selector: 'app-visit',
  imports: [FormsModule, RouterLink, TranslatePipe, Button, Textarea, BookingStatusTag, PhonePipe, LocalTimeRangePipe, PhotoGallery],
  styles: `
    :host { display: block; max-width: 640px; margin-inline: auto; }
    .back { color: var(--fo-muted); text-decoration: none; display: inline-flex; gap: .35rem; align-items: center; margin-block-end: .75rem; }
    .panel + .panel { margin-top: .875rem; }
    h2 { font-size: 1.05rem; margin: 0 0 .75rem; }
    .row { display: flex; justify-content: space-between; gap: .75rem; align-items: center; }
    .time { font-size: 1.2rem; font-weight: 700; }
    .actions { display: grid; gap: .5rem; margin-top: .75rem; }
    ul { margin: .25rem 0 0; padding-inline-start: 1.1rem; }
    .note-box { display: flex; gap: .5rem; align-items: flex-start; }
    .note-box textarea { flex: 1; }
    .links { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .5rem; }
    .links a { text-decoration: none; }
  `,
  template: `
    <a routerLink="/today" class="back"><i class="pi pi-arrow-right rtl-flip"></i>{{ 'field.myVisits' | translate }}</a>

    @if (booking(); as b) {
      <div class="panel">
        <div class="row">
          <span class="time">{{ b.scheduledStart | ltimeRange: b.scheduledEnd }}</span>
          <app-booking-status [status]="b.status" />
        </div>
        <h2 style="margin-top: .5rem">#{{ b.number }} · {{ b.customerName }}</h2>
        @if (b.addressText) { <div class="muted"><i class="pi pi-map-marker"></i> {{ b.addressText }}</div> }
        <div class="links">
          <a [href]="'tel:' + b.customerPhone"><p-button icon="pi pi-phone" [label]="(b.customerPhone | phone)" [outlined]="true" size="small" /></a>
          <a [href]="'https://wa.me/' + b.customerPhone.replace('+', '')" target="_blank" rel="noopener"><p-button icon="pi pi-whatsapp" label="WhatsApp" [outlined]="true" size="small" /></a>
          @if (b.navigationUrl) {
            <a [href]="b.navigationUrl" target="_blank" rel="noopener"><p-button icon="pi pi-directions" [label]="'field.navigate' | translate" [outlined]="true" size="small" /></a>
          }
        </div>
        <ul>
          @for (it of b.items; track $index) { <li>{{ it.description }} @if (it.quantity !== 1) { × {{ it.quantity }} }</li> }
        </ul>
        @if (b.notes) { <p><i class="pi pi-info-circle"></i> {{ b.notes }}</p> }

        <div class="actions">
          @for (t of b.allowedTransitions; track t) {
            <p-button
              [label]="'bookingAction.' + t | translate"
              [severity]="t === 'NO_SHOW' ? 'danger' : t === 'COMPLETED' ? 'success' : 'primary'"
              [outlined]="t === 'NO_SHOW'"
              [size]="t === 'NO_SHOW' ? 'small' : 'large'"
              [fluid]="true"
              [loading]="busy()"
              (onClick)="move(t)"
            />
          }
        </div>
        @if (needsAfterPhoto()) {
          <p class="muted" style="margin-top: .5rem"><i class="pi pi-camera"></i> {{ 'field.afterPhotoHint' | translate }}</p>
        }
      </div>

      <div class="panel">
        <h2>{{ 'photos.title' | translate }}</h2>
        <app-photo-gallery
          [bookingId]="b.id"
          [canUpload]="canPhoto()"
          [completed]="b.status === 'COMPLETED'"
          (changed)="photoCount.set($event)"
        />
      </div>

      <div class="panel">
        <h2>{{ 'bookings.addNote' | translate }}</h2>
        <div class="note-box">
          <textarea pTextarea [(ngModel)]="note" rows="2" [placeholder]="'field.notePlaceholder' | translate"></textarea>
          <p-button icon="pi pi-send" [disabled]="!note.trim()" (onClick)="addNote()" />
        </div>
      </div>
    }
  `,
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
