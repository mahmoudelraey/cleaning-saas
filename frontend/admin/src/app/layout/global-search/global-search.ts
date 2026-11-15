import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { BookingSummary, CustomerSummary, Page } from '../../core/api.types';
import { STATUS_COLOR } from '../../shared/booking-status/booking-status';
import { PhonePipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';

interface Hit {
  kind: 'booking' | 'customer';
  id: string;
  link: unknown[];
  booking?: BookingSummary;
  customer?: CustomerSummary;
}

/** Top-bar search over bookings (number, customer, mobile) and customers. Ctrl+K or "/" focuses it. */
@Component({
  selector: 'app-global-search',
  imports: [TranslatePipe, PhonePipe, LocalDatePipe],
  styleUrl: './global-search.scss',
  templateUrl: './global-search.html',
})
export class GlobalSearch {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly active = signal(0);
  protected readonly hits = signal<Hit[]>([]);
  protected readonly bookingHits = computed(() => this.hits().filter((h) => h.kind === 'booking'));
  protected readonly customerHits = computed(() => this.hits().filter((h) => h.kind === 'customer'));

  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        map((q) => q.trim().replace(/^#/, '')),
        debounceTime(250),
        distinctUntilChanged(),
        tap((q) => this.loading.set(q.length >= 2)),
        switchMap((q) =>
          q.length < 2
            ? of<Hit[]>([])
            : forkJoin({
                bookings: this.http
                  .get<Page<BookingSummary>>('/api/v1/bookings', { params: { q, size: 5, page: 0 } })
                  .pipe(catchError(() => of(null))),
                customers: this.http
                  .get<Page<CustomerSummary>>('/api/v1/customers', { params: { q, size: 5, page: 0 } })
                  .pipe(catchError(() => of(null))),
              }).pipe(
                map(({ bookings, customers }) => [
                  ...(bookings?.items ?? []).map((b): Hit => ({ kind: 'booking', id: b.id, link: ['/bookings', b.id], booking: b })),
                  ...(customers?.items ?? []).map((c): Hit => ({ kind: 'customer', id: c.id, link: ['/customers', c.id], customer: c })),
                ]),
              ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((hits) => {
        this.hits.set(hits);
        this.active.set(0);
        this.loading.set(false);
      });
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    this.query$.next(value);
  }

  protected onKey(e: KeyboardEvent): void {
    const n = this.hits().length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.active.set((this.active() + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.active.set((this.active() - 1 + n) % n);
    } else if (e.key === 'Enter' && n) {
      e.preventDefault();
      this.go(this.hits()[this.active()]);
    } else if (e.key === 'Escape') {
      this.open.set(false);
      this.input().nativeElement.blur();
    }
  }

  protected indexOf(h: Hit): number {
    return this.hits().indexOf(h);
  }

  protected color(s: BookingSummary['status']): string {
    return STATUS_COLOR[s];
  }

  protected go(h: Hit): void {
    this.open.set(false);
    this.query.set('');
    this.query$.next('');
    this.hits.set([]);
    void this.router.navigate(h.link);
  }

  @HostListener('document:click', ['$event'])
  protected onDocClick(e: MouseEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  protected onShortcut(e: KeyboardEvent): void {
    const typing = (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]');
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      this.input().nativeElement.focus();
    }
  }
}
