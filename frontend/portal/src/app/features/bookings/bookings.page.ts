import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { BookingSummary } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe } from '../../core/format';
import { PortalApi } from '../../core/portal.api';
import { VisitServicesPipe } from '../../core/service-names';

@Component({
  selector: 'pt-bookings',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, VisitServicesPipe],
  styles: `
    .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
    .row .when { width: 56px; flex: none; text-align: center; line-height: 1.1; padding: 6px 0; border-radius: 12px; background: var(--mist); }
    .row .when b { display: block; font-size: 1.35rem; }
    .row .when small { color: var(--ink-2); font-size: .75rem; }
    .row .txt { flex: 1; min-width: 0; }
    .row .txt div { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row .txt small { color: var(--ink-2); }
  `,
  template: `
    <div class="page">
      <div class="head">
        <h1 class="page-title">{{ 'bookings.title' | translate }}</h1>
        @if (store.company()?.bookingOpen) {
          <a class="btn btn-primary" [routerLink]="['/', store.slug(), 'book']"><i class="pi pi-plus"></i>{{ 'home.book' | translate }}</a>
        }
      </div>
      <div class="segmented" role="tablist">
        <button type="button" role="tab" [class.on]="scope() === 'upcoming'" [attr.aria-selected]="scope() === 'upcoming'" (click)="load('upcoming')">
          {{ 'bookings.upcoming' | translate }}
        </button>
        <button type="button" role="tab" [class.on]="scope() === 'past'" [attr.aria-selected]="scope() === 'past'" (click)="load('past')">
          {{ 'bookings.past' | translate }}
        </button>
      </div>

      @if (loading()) {
        <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (rows().length) {
        <div class="rows">
          @for (b of rows(); track b.id) {
            <a class="row" [routerLink]="['/', store.slug(), 'bookings', b.id]">
              <span class="when"><b class="tnum">{{ b.scheduledStart | ldate: 'dayNum' }}</b><small>{{ b.scheduledStart | ldate: 'month' }}</small></span>
              <span class="txt">
                <div>{{ (b | visitServices) || ('#' + b.number) }}</div>
                <small>{{ b.scheduledStart | ldate: 'weekday' }} {{ b.scheduledStart | ldate: 'time' }}</small>
              </span>
              <span class="status" [class]="'status s-' + b.status">{{ 'status.' + b.status | translate }}</span>
            </a>
          }
        </div>
      } @else {
        <div class="sheet empty">
          <i class="pi pi-calendar"></i>
          <p>{{ (scope() === 'upcoming' ? 'bookings.noneUpcoming' : 'bookings.nonePast') | translate }}</p>
          @if (scope() === 'upcoming' && store.company()?.bookingOpen) {
            <a class="btn btn-primary" [routerLink]="['/', store.slug(), 'book']">{{ 'home.book' | translate }}</a>
          }
        </div>
      }
    </div>
  `,
})
export class BookingsPage implements OnInit {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);

  protected readonly scope = signal<'upcoming' | 'past'>('upcoming');
  protected readonly rows = signal<BookingSummary[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.load('upcoming');
  }

  load(scope: 'upcoming' | 'past'): void {
    this.scope.set(scope);
    this.loading.set(true);
    this.api.bookings(this.store.slug(), scope).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
