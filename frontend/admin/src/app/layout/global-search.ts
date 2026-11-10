import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { BookingSummary, CustomerSummary, Page } from '../core/api.types';
import { STATUS_COLOR } from '../shared/booking-status';
import { PhonePipe } from '../shared/format';
import { LocalDatePipe } from '../shared/local-date.pipe';

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
  styles: `
    :host { position: relative; display: block; width: min(520px, 100%); }
    .box { display: flex; align-items: center; gap: .6rem; height: 50px; padding-inline: 1rem; border-radius: 16px;
           border: 1px solid var(--fo-border); background: var(--fo-surface); box-shadow: 0 6px 18px -14px rgba(16, 42, 46, .35);
           transition: border-color .15s, background .15s, box-shadow .15s; }
    .box:focus-within { background: var(--fo-surface); border-color: var(--p-primary-400);
                        box-shadow: 0 0 0 3px color-mix(in srgb, var(--p-primary-500) 15%, transparent); }
    .box > i { color: var(--fo-muted); font-size: 1.05rem; }
    input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: .9rem; color: var(--fo-text); }
    kbd { font: inherit; font-size: .72rem; font-weight: 600; color: var(--fo-muted); border: 1px solid var(--fo-border); border-radius: 999px; padding: .15rem .6rem; background: var(--fo-bg); }
    .panel { position: absolute; top: calc(100% + 6px); inset-inline: 0; z-index: 30; background: var(--fo-surface); border: 1px solid var(--fo-border);
             border-radius: 12px; box-shadow: 0 16px 40px -12px rgba(15, 23, 42, .25); max-height: 420px; overflow-y: auto; padding: .35rem; }
    .group { font-size: .72rem; font-weight: 600; color: var(--fo-muted); padding: .5rem .6rem .25rem; }
    .hit { display: flex; align-items: center; gap: .7rem; width: 100%; padding: .55rem .6rem; border: 0; background: none; border-radius: 9px;
           font: inherit; text-align: start; cursor: pointer; color: var(--fo-text); }
    .hit.on, .hit:hover { background: var(--fo-bg); }
    .ic { width: 32px; height: 32px; flex: none; border-radius: 8px; display: grid; place-items: center; font-size: .85rem;
          background: color-mix(in srgb, var(--p-primary-500) 10%, transparent); color: var(--p-primary-700); }
    .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .txt strong { font-size: .88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .txt small { font-size: .75rem; color: var(--fo-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chip { font-size: .7rem; font-weight: 600; padding: .12rem .5rem; border-radius: 999px; white-space: nowrap;
            color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
    .empty { padding: 1rem; text-align: center; color: var(--fo-muted); font-size: .85rem; }
    @media (max-width: 640px) { kbd { display: none; } }
  `,
  template: `
    <div class="box">
      <i class="pi pi-search"></i>
      <input
        #input
        type="search"
        [value]="query()"
        (input)="onInput($any($event.target).value)"
        (focus)="open.set(true)"
        (keydown)="onKey($event)"
        [placeholder]="'search.placeholder' | translate"
        [attr.aria-label]="'search.placeholder' | translate"
        autocomplete="off"
      />
      @if (loading()) { <i class="pi pi-spin pi-spinner"></i> } @else { <kbd>Ctrl K</kbd> }
    </div>

    @if (open() && query().trim().length >= 2 && !loading()) {
      <div class="panel" role="listbox">
        @if (hits().length) {
          @if (bookingHits().length) { <div class="group">{{ 'nav.bookings' | translate }}</div> }
          @for (h of bookingHits(); track h.id) {
            <button type="button" class="hit" [class.on]="active() === indexOf(h)" (mouseenter)="active.set(indexOf(h))" (click)="go(h)">
              <span class="ic"><i class="pi pi-inbox"></i></span>
              <span class="txt">
                <strong>#{{ h.booking!.number }} · {{ h.booking!.customerName }}</strong>
                <small>{{ h.booking!.scheduledStart | ldate: 'medium' }}</small>
              </span>
              <span class="chip" [style.--c]="color(h.booking!.status)">{{ 'bookingStatus.' + h.booking!.status | translate }}</span>
            </button>
          }
          @if (customerHits().length) { <div class="group">{{ 'nav.customers' | translate }}</div> }
          @for (h of customerHits(); track h.id) {
            <button type="button" class="hit" [class.on]="active() === indexOf(h)" (mouseenter)="active.set(indexOf(h))" (click)="go(h)">
              <span class="ic"><i class="pi pi-user"></i></span>
              <span class="txt">
                <strong>{{ h.customer!.name }}</strong>
                <small class="ltr">{{ h.customer!.phone | phone }}</small>
              </span>
            </button>
          }
        } @else {
          <div class="empty">{{ 'search.none' | translate }}</div>
        }
      </div>
    }
  `,
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
