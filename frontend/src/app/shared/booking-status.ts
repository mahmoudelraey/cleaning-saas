import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Tag } from 'primeng/tag';

import { BookingStatus } from '../core/api.types';

type Severity = 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast';

export const STATUS_SEVERITY: Record<BookingStatus, Severity> = {
  NEW: 'warn',
  CONFIRMED: 'info',
  ASSIGNED: 'contrast',
  ON_THE_WAY: 'info',
  IN_PROGRESS: 'warn',
  COMPLETED: 'success',
  CANCELLED: 'secondary',
  NO_SHOW: 'danger',
};

/** Background colours for calendar blocks of unassigned / finished bookings. */
export const STATUS_COLOR: Record<BookingStatus, string> = {
  NEW: '#f59e0b',
  CONFIRMED: '#3b82f6',
  ASSIGNED: '#0ea5a4',
  ON_THE_WAY: '#6366f1',
  IN_PROGRESS: '#f97316',
  COMPLETED: '#16a34a',
  CANCELLED: '#94a3b8',
  NO_SHOW: '#dc2626',
};

export const ALL_STATUSES: BookingStatus[] = [
  'NEW',
  'CONFIRMED',
  'ASSIGNED',
  'ON_THE_WAY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

@Component({
  selector: 'app-booking-status',
  imports: [Tag, TranslatePipe],
  template: `<p-tag [value]="'bookingStatus.' + status() | translate" [severity]="severity()" />`,
})
export class BookingStatusTag {
  readonly status = input.required<BookingStatus>();
  protected severity = () => STATUS_SEVERITY[this.status()];
}
