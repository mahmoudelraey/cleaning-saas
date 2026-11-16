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
import { ALL_STATUSES, BookingStatusTag } from '../../shared/booking-status/booking-status';
import { PhonePipe, SarPipe } from '../../shared/format';
import { BookingsApi } from './bookings.api';
import { LocalDatePipe, LocalTimeRangePipe } from '../../shared/local-date.pipe';
import { DetailField, DetailsDialog } from '../../shared/details-dialog/details-dialog';
import { CreatedBy } from '../../shared/details-dialog/audit-block';

@Component({
  selector: 'app-bookings',
  imports: [DetailsDialog, CreatedBy,
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
  styleUrl: './bookings.page.scss',
  templateUrl: './bookings.page.html',
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

  /** Position in the list, counting across pages (1, 2, 3, …); the booking's own number is shown as #n next to the date. */
  protected rowNumber(b: unknown): number {
    return this.page * this.pageSize + this.rows().indexOf(b as never) + 1;
  }

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
        sort: 'created',
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
  /** Read-only details with who created / last changed the record (eye button in the table). */
  protected readonly viewing = signal<BookingSummary | null>(null);
  protected readonly viewOpen = signal(false);

  protected view(item: BookingSummary, event?: Event): void {
    event?.stopPropagation();
    this.viewing.set(item);
    this.viewOpen.set(true);
  }

  protected viewFields(x: BookingSummary): DetailField[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { label: 'common.status', value: t('bookingStatus.' + x.status), kind: 'status', on: x.status !== 'CANCELLED' && x.status !== 'NO_SHOW' },
      { label: 'bookings.when', value: x.scheduledStart, kind: 'datetime' },
      { label: 'bookings.requestedAt', value: x.createdAt ?? null, kind: 'datetime' },
      { label: 'bookings.customer', value: x.customerName },
      { label: 'customers.phone', value: x.customerPhone, kind: 'phone' },
      { label: 'bookings.technicians', value: (x.technicians ?? []).map((tc) => tc.name).join('، ') },
      { label: 'bookings.amount', value: x.totalHalalas ?? x.subtotalHalalas, kind: 'money' },
      { label: 'bookings.services', value: (x.services ?? []).join('، '), full: true },
    ];
  }

}
