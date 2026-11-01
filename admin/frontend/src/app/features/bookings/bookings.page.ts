import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { MultiSelect } from 'primeng/multiselect';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { BookingStatus, BookingSummary } from '../../core/api.types';
import { ALL_STATUSES, BookingStatusTag } from '../../shared/booking-status';
import { PhonePipe, SarPipe } from '../../shared/format';
import { BookingsApi } from './bookings.api';
import { LocalDatePipe, LocalTimeRangePipe } from '../../shared/local-date.pipe';

@Component({
  selector: 'app-bookings',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    TableModule,
    Button,
    IconField,
    InputIcon,
    InputText,
    MultiSelect,
    DatePicker,
    LocalDatePipe,
    LocalTimeRangePipe,
    PhonePipe,
    SarPipe,
    BookingStatusTag,
  ],
  styles: `
    .filters p-multiselect, .filters p-datepicker { min-width: 220px; }
    .techs { display: flex; gap: .35rem; flex-wrap: wrap; }
    .tech { display: inline-flex; align-items: center; gap: .3rem; font-size: .85rem; }
    .num { font-variant-numeric: tabular-nums; color: var(--fo-muted); }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'bookings.title' | translate }}</h1>
        <p>{{ 'bookings.subtitle' | translate }}</p>
      </div>
      <a routerLink="/bookings/new"><p-button icon="pi pi-plus" [label]="'bookings.new' | translate" /></a>
    </div>

    <div class="panel-flush">
      <div class="toolbar-row filters">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input
            pInputText
            type="search"
            [placeholder]="'bookings.searchPlaceholder' | translate"
            (input)="search$.next($any($event.target).value)"
          />
        </p-iconfield>
        <p-multiselect
          [options]="statusOptions()"
          [(ngModel)]="statuses"
          (onChange)="reload()"
          optionLabel="label"
          optionValue="value"
          [placeholder]="'bookings.allStatuses' | translate"
          display="chip"
          [showClear]="true"
          (onClear)="reload()"
        />
        <p-datepicker
          [(ngModel)]="range"
          selectionMode="range"
          [readonlyInput]="true"
          [showIcon]="true"
          [showButtonBar]="true"
          (onSelect)="onRange()"
          (onClearClick)="reload()"
          [placeholder]="'bookings.dateRange' | translate"
          dateFormat="yy-mm-dd"
        />
      </div>

      <p-table
        [value]="rows()"
        [lazy]="true"
        (onLazyLoad)="load($event)"
        [paginator]="true"
        [rows]="pageSize"
        [totalRecords]="total()"
        [loading]="loading()"
        [rowHover]="true"
        dataKey="id"
      >
        <ng-template #header>
          <tr>
            <th>#</th>
            <th>{{ 'bookings.when' | translate }}</th>
            <th>{{ 'bookings.customer' | translate }}</th>
            <th>{{ 'bookings.technicians' | translate }}</th>
            <th>{{ 'bookings.amount' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
          </tr>
        </ng-template>
        <ng-template #body let-b>
          <tr (click)="open(b)" style="cursor: pointer">
            <td class="num">{{ b.number }}</td>
            <td>
              {{ b.scheduledStart | ldate: 'weekdayDay' }}
              <div class="muted">{{ b.scheduledStart | ltimeRange: b.scheduledEnd }}</div>
            </td>
            <td>
              {{ b.customerName }}
              <div class="muted"><span class="ltr">{{ b.customerPhone | phone }}</span></div>
            </td>
            <td>
              <div class="techs">
                @for (t of b.technicians; track t.id) {
                  <span class="tech"><span class="color-dot" [style.background]="t.color"></span>{{ t.name }}</span>
                } @empty {
                  <span class="muted">—</span>
                }
              </div>
            </td>
            <td><span class="ltr">{{ b.subtotalHalalas | sar }}</span></td>
            <td><app-booking-status [status]="b.status" /></td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="6"><div class="empty"><i class="pi pi-calendar"></i>{{ 'bookings.empty' | translate }}</div></td>
          </tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class BookingsPage implements OnInit {
  private readonly api = inject(BookingsApi);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = 20;
  protected readonly rows = signal<BookingSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly search$ = new Subject<string>();

  protected statuses: BookingStatus[] = [];
  protected range: Date[] | null = null;
  private query = '';
  private page = 0;

  protected readonly statusOptions = computed(() =>
    ALL_STATUSES.map((s) => ({ value: s, label: this.translate.instant('bookingStatus.' + s) })),
  );

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => {
        this.query = q;
        this.reload();
      });
  }

  load(e: TableLazyLoadEvent): void {
    this.page = Math.floor((e.first ?? 0) / (e.rows ?? this.pageSize));
    this.fetch();
  }

  reload(): void {
    this.page = 0;
    this.fetch();
  }

  onRange(): void {
    if (this.range && this.range[0] && this.range[1]) {
      this.reload();
    }
  }

  open(b: BookingSummary): void {
    void this.router.navigate(['/bookings', b.id]);
  }

  private fetch(): void {
    const [from, to] = this.range ?? [];
    const end = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) : undefined;
    this.loading.set(true);
    this.api
      .list({
        status: this.statuses,
        from: from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()).toISOString() : undefined,
        to: end?.toISOString(),
        q: this.query,
        page: this.page,
        size: this.pageSize,
      })
      .subscribe({
        next: (p) => {
          this.rows.set(p.items);
          this.total.set(p.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
