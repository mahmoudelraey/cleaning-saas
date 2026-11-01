import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';

import { BookingStatus } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { BookingStatusTag } from '../../shared/booking-status';
import { LocalDatePipe, LocalTimeRangePipe } from '../../shared/local-date.pipe';
import { BookingsApi } from '../bookings/bookings.api';
import { FieldApi, VisitCard } from './field.api';

/** Technician home (PWA): today's visits as big, thumb-friendly cards. */
@Component({
  selector: 'app-today',
  imports: [FormsModule, RouterLink, TranslatePipe, Button, SelectButton, BookingStatusTag, LocalDatePipe, LocalTimeRangePipe],
  styles: `
    :host { display: block; max-width: 640px; margin-inline: auto; }
    .day-switch { margin-block-end: 1rem; display: flex; justify-content: center; }
    .card { background: var(--fo-surface); border: 1px solid var(--fo-border); border-radius: 16px; padding: 1rem; display: grid; gap: .6rem; }
    .card + .card { margin-top: .875rem; }
    .card.done { opacity: .7; }
    .top { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
    .time { font-size: 1.25rem; font-weight: 700; }
    .name { font-weight: 600; font-size: 1.05rem; color: inherit; text-decoration: none; }
    .addr { color: var(--fo-muted); }
    .services { font-size: .9rem; }
    .quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; }
    .quick a { text-decoration: none; }
    .notes { background: #fffbeb; border-radius: 10px; padding: .5rem .75rem; font-size: .9rem; }
    .summary { text-align: center; color: var(--fo-muted); margin-block-end: .75rem; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'field.hello' | translate: { name: auth.user()?.name } }}</h1>
        <p>{{ day() | ldate: 'fullDate' }}</p>
      </div>
    </div>

    <div class="day-switch">
      <p-selectbutton [options]="dayOptions()" [ngModel]="offset()" (ngModelChange)="setOffset($event)" optionLabel="label" optionValue="value" [allowEmpty]="false" />
    </div>

    @if (visits().length) {
      <p class="summary">{{ 'field.summary' | translate: { done: doneCount(), total: visits().length } }}</p>
    }

    @for (v of visits(); track v.id) {
      <div class="card" [class.done]="v.status === 'COMPLETED' || v.status === 'NO_SHOW'">
        <div class="top">
          <span class="time">{{ v.scheduledStart | ltimeRange: v.scheduledEnd }}</span>
          <app-booking-status [status]="v.status" />
        </div>
        <a class="name" [routerLink]="['/visit', v.id]">#{{ v.number }} · {{ v.customerName }}</a>
        @if (v.addressText) { <div class="addr"><i class="pi pi-map-marker"></i> {{ v.addressText }}</div> }
        <div class="services">{{ v.services.join('، ') }}</div>
        @if (v.notes) { <div class="notes"><i class="pi pi-info-circle"></i> {{ v.notes }}</div> }

        <div class="quick">
          <a [href]="'tel:' + v.customerPhone"><p-button icon="pi pi-phone" [label]="'field.call' | translate" [outlined]="true" [fluid]="true" size="small" /></a>
          <a [href]="'https://wa.me/' + v.customerPhone.replace('+', '')" target="_blank" rel="noopener"><p-button icon="pi pi-whatsapp" label="WhatsApp" [outlined]="true" [fluid]="true" size="small" /></a>
          @if (v.navigationUrl) {
            <a [href]="v.navigationUrl" target="_blank" rel="noopener"><p-button icon="pi pi-directions" [label]="'field.navigate' | translate" [outlined]="true" [fluid]="true" size="small" /></a>
          } @else {
            <p-button icon="pi pi-directions" [label]="'field.navigate' | translate" [outlined]="true" [fluid]="true" size="small" [disabled]="true" />
          }
        </div>

        @if (primary(v); as next) {
          <p-button
            [label]="'bookingAction.' + next | translate"
            [icon]="next === 'ON_THE_WAY' ? 'pi pi-car' : next === 'IN_PROGRESS' ? 'pi pi-play' : 'pi pi-check-circle'"
            [severity]="next === 'COMPLETED' ? 'success' : 'primary'"
            size="large"
            [fluid]="true"
            [loading]="busyId() === v.id"
            (onClick)="advance(v, next)"
          />
        }
        <a [routerLink]="['/visit', v.id]"><p-button [label]="'field.openVisit' | translate" icon="pi pi-camera" [text]="true" [fluid]="true" size="small" /></a>
      </div>
    } @empty {
      <div class="panel empty"><i class="pi pi-sun"></i>{{ 'field.noVisits' | translate }}</div>
    }
  `,
})
export class TodayPage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(FieldApi);
  private readonly bookings = inject(BookingsApi);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly offset = signal(0);
  protected readonly visits = signal<VisitCard[]>([]);
  protected readonly busyId = signal<string | null>(null);

  protected readonly day = computed(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + this.offset());
  });
  protected readonly doneCount = computed(() => this.visits().filter((v) => v.status === 'COMPLETED').length);
  protected readonly dayOptions = computed(() => [
    { value: -1, label: this.translate.instant('field.yesterday') },
    { value: 0, label: this.translate.instant('calendar.today') },
    { value: 1, label: this.translate.instant('field.tomorrow') },
  ]);

  ngOnInit(): void {
    this.load();
  }

  setOffset(v: number): void {
    this.offset.set(v);
    this.load();
  }

  /** The obvious next step; "no-show" stays on the visit page to avoid accidental taps. */
  primary(v: VisitCard): BookingStatus | null {
    return v.allowedTransitions.find((t) => t !== 'NO_SHOW') ?? null;
  }

  advance(v: VisitCard, next: BookingStatus): void {
    this.busyId.set(v.id);
    this.bookings.changeStatus(v.id, next).subscribe({
      next: () => {
        this.busyId.set(null);
        this.load();
      },
      error: (err) => {
        this.busyId.set(null);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  private load(): void {
    const d = this.day();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.api.myVisits(date).subscribe((v) => this.visits.set(v));
  }
}
