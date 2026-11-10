import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { BookingDetail, BookingEvent, MyReview } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { liveRefresh } from '../../core/live-refresh';
import { PortalApi } from '../../core/portal.api';
import { ToastService } from '../../core/toast';
import { ItemTextPipe } from '../../core/service-names';
import { RateVisit } from './rate-visit';
import { StatusRail } from '../../shared/status-rail';

@Component({
  selector: 'pt-booking-detail',
  imports: [FormsModule, RouterLink, TranslatePipe, LocalDatePipe, SarPipe, StatusRail, RateVisit, ItemTextPipe],
  styles: `
    .back { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); text-decoration: none; font-weight: 600; margin-bottom: 14px; }
    .when h1 { font-size: 1.5rem; font-weight: 700; }
    .when .time { font-size: 2.2rem; font-weight: 700; line-height: 1.1; color: var(--tide-deep); }
    .when small { color: var(--ink-2); }
    .rail { margin-top: 18px; }
    dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 12px 16px; }
    dt { color: var(--ink-2); }
    dd { margin: 0; text-align: end; font-weight: 600; }
    .lines { margin: 0; padding: 0; list-style: none; }
    .lines li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; }
    .lines li.addon { color: var(--ink-2); font-size: .92rem; padding-inline-start: 14px; }
    .lines li.off { color: #0d5c46; font-weight: 600; }
    .lines li.total { border-top: 1px solid var(--line); margin-top: 6px; padding-top: 12px; font-weight: 700; }
    .vat { color: var(--ink-3); font-size: .8rem; margin: 6px 0 0; }
    .log { list-style: none; margin: 0; padding: 0; }
    .log li { position: relative; padding: 0 0 16px; padding-inline-start: 22px; }
    .log li::before { content: ''; position: absolute; inset-inline-start: 4px; top: 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--tide); }
    .log li:not(:last-child)::after { content: ''; position: absolute; inset-inline-start: 7px; top: 20px; bottom: 2px; width: 2px; background: var(--line); }
    .log small { display: block; color: var(--ink-3); font-size: .8rem; }
    .cancel-note { color: var(--ink-2); font-size: .88rem; text-align: center; margin: 12px 0 0; }
    .reason { margin-top: 12px; padding: 12px 14px; border-radius: var(--r-md); background: var(--rose-soft); color: var(--rose); }
  `,
  template: `
    <div class="page">
      <a class="back" [routerLink]="['/', store.slug(), 'bookings']"><i class="pi pi-arrow-right rtl-flip"></i>{{ 'bookings.title' | translate }}</a>

      @if (detail(); as d) {
        <section class="sheet when">
          <small>#{{ d.booking.number }}</small>
          <h1>{{ d.booking.scheduledStart | ldate: 'full' }}</h1>
          <div class="time tnum">{{ d.booking.scheduledStart | ldate: 'time' }} – {{ d.booking.scheduledEnd | ldate: 'time' }}</div>
          <div class="rail"><pt-status-rail [status]="d.booking.status" /></div>
          @if (d.cancelReason) { <div class="reason">{{ 'detail.reason' | translate }}: {{ d.cancelReason }}</div> }
        </section>

        <h2 class="section-title">{{ 'detail.services' | translate }}</h2>
        <section class="sheet">
          <ul class="lines">
            @for (it of d.items; track $index) {
              <li [class.addon]="it.addon"><span>{{ it | itemText }}@if (it.quantity !== 1) { <span class="muted"> × {{ it.quantity }}</span> }</span><span class="ltr">{{ it.totalHalalas | sar }}</span></li>
            }
            @if (d.discountHalalas) {
              <li class="off"><span>{{ 'promo.discount' | translate: { code: d.promoCode ?? '' } }}</span><span class="ltr">−{{ d.discountHalalas | sar }}</span></li>
            }
            <li class="total"><span>{{ 'detail.total' | translate }}</span><span class="ltr">{{ (d.booking.subtotalHalalas - (d.discountHalalas ?? 0)) | sar }}</span></li>
          </ul>
          @if (store.company()?.vatRegistered && !store.company()?.pricesIncludeVat) { <p class="vat">{{ 'detail.vatNote' | translate }}</p> }
        </section>

        <h2 class="section-title">{{ 'detail.details' | translate }}</h2>
        <section class="sheet">
          <dl>
            @if (d.booking.technicians.length) {
              <dt>{{ 'detail.technician' | translate }}</dt><dd>{{ techNames() }}</dd>
            }
            <dt>{{ 'detail.address' | translate }}</dt>
            <dd>
              {{ d.booking.addressText || ('detail.noAddress' | translate) }}
              @if (d.navigationUrl) { <div><a [href]="d.navigationUrl" target="_blank" rel="noopener">{{ 'detail.map' | translate }}</a></div> }
            </dd>
            <dt>{{ 'detail.payment' | translate }}</dt>
            <dd>{{ d.booking.paymentMethod ? ('payment.' + d.booking.paymentMethod | translate) : ('detail.notSet' | translate) }}</dd>
            @if (d.notes) { <dt>{{ 'detail.notes' | translate }}</dt><dd>{{ d.notes }}</dd> }
          </dl>
        </section>

        @if (d.canReview) {
          <h2 class="section-title">{{ 'rate.title' | translate }}</h2>
          <pt-rate-visit [slug]="store.slug()" [bookingId]="d.booking.id" [review]="d.review" (saved)="reviewed($event)" />
        }

        @if (d.invoice; as inv) {
          <h2 class="section-title">{{ 'detail.invoice' | translate }}</h2>
          <div class="rows">
            <button type="button" class="row" (click)="openInvoice(inv.id)" [disabled]="opening()">
              <i class="pi pi-receipt" style="color: var(--tide)"></i>
              <span style="flex:1">{{ 'invoices.number' | translate: { n: inv.number } }}<br /><small class="muted">{{ 'invoiceStatus.' + inv.status | translate }}</small></span>
              <span class="ltr" style="font-weight:700">{{ inv.totalHalalas | sar }}</span>
              <i class="pi pi-external-link muted"></i>
            </button>
          </div>
        }

        <h2 class="section-title">{{ 'detail.history' | translate }}</h2>
        <section class="sheet">
          <ol class="log">
            @for (e of d.events; track $index) {
              <li>{{ eventText(e) }}<small>{{ e.at | ldate: 'dateTime' }}</small></li>
            }
          </ol>
        </section>

        @if (d.canCancel) {
          <div style="margin-top: 22px">
            <button type="button" class="btn btn-danger btn-block" (click)="cancelOpen.set(true)">{{ 'detail.cancel' | translate }}</button>
            <p class="cancel-note">{{ 'detail.cancelUntil' | translate: { when: (d.cancelDeadline | ldate: 'dateTime') } }}</p>
          </div>
        } @else if (['NEW', 'CONFIRMED', 'ASSIGNED'].includes(d.booking.status) && store.company()?.phone) {
          <p class="cancel-note">{{ 'detail.tooLate' | translate }} <a [href]="'tel:' + store.company()?.phone">{{ 'home.call' | translate }}</a></p>
        }
      } @else {
        <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
      }
    </div>

    @if (cancelOpen()) {
      <div class="backdrop" (click)="cancelOpen.set(false)">
        <div class="dialog" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <h2>{{ 'detail.cancelTitle' | translate }}</h2>
          <p class="muted" style="margin-top:0">{{ 'detail.cancelLead' | translate }}</p>
          <div class="field">
            <label for="rs">{{ 'detail.reasonOptional' | translate }}</label>
            <textarea id="rs" class="input" rows="3" maxlength="500" [(ngModel)]="reason"></textarea>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-quiet" (click)="cancelOpen.set(false)">{{ 'detail.keep' | translate }}</button>
            <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="cancel()">{{ 'detail.confirmCancel' | translate }}</button>
          </div>
        </div>
      </div>
    }
  `,
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

  openInvoice(id: string): void {
    // Open the tab synchronously (popup blockers), then point it at the invoice page.
    const tab = window.open('', '_blank');
    this.opening.set(true);
    this.api.invoiceLink(this.store.slug(), id).subscribe({
      next: (r) => {
        this.opening.set(false);
        if (tab) {
          tab.location.href = r.url;
        } else {
          window.location.href = r.url;
        }
      },
      error: (e) => {
        this.opening.set(false);
        tab?.close();
        this.toasts.show(errorMessage(e, this.translate), 'error');
      },
    });
  }
}
