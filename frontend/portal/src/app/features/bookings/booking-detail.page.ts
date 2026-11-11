import { Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { BookingDetail, BookingEvent, BookingStatus, MyReview } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { liveRefresh } from '../../core/live-refresh';
import { PortalApi } from '../../core/portal.api';
import { ToastService } from '../../core/toast';
import { ItemTextPipe } from '../../core/service-names';
import { RateVisit } from './rate-visit';
import { VisitTracker } from '../../shared/visit-tracker';

@Component({
  selector: 'pt-booking-detail',
  imports: [FormsModule, RouterLink, TranslatePipe, LocalDatePipe, SarPipe, VisitTracker, RateVisit, ItemTextPipe],
  styles: `
    :host { display: block; position: relative; overflow-x: clip;
            background:
              radial-gradient(520px 420px at 0% 10%, rgba(20, 155, 116, .10), transparent 70%),
              radial-gradient(520px 420px at 100% 90%, rgba(20, 155, 116, .10), transparent 70%),
              linear-gradient(180deg, #f3faf8 0%, #f8fbfa 100%); }
    .bd { max-width: 1600px; margin: 0 auto; padding: 22px 20px 110px; }
    .back { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 999px; background: #fff;
            border: 1px solid #e2ece9; color: #0d5c46; text-decoration: none; font-weight: 700; margin-bottom: 18px;
            box-shadow: 0 8px 20px -16px rgba(15, 42, 61, .4); }
    .back:hover { background: #f0fdf8; }

    /* The visit: green card with when, and where it stands */
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); background: #fff; border-radius: 28px;
            border: 1px solid rgba(226, 232, 240, .8); box-shadow: 0 24px 50px -30px rgba(13, 92, 70, .4); overflow: hidden; margin-bottom: 22px; }
    .track { padding: 30px 28px 24px; display: flex; flex-direction: column; justify-content: center; gap: 14px; }
    .reason { margin: 0; padding: 12px 16px; border-radius: 16px; background: #fdecec; color: #b42318; font-weight: 600; }
    .when { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 30px 34px 30px 92px; color: #fff; overflow: hidden;
            background: linear-gradient(135deg, #0d5c46 0%, #149b74 100%); }
    :host-context([dir='rtl']) .when { padding: 30px 92px 30px 34px; }
    .when::before { content: ''; position: absolute; top: -10%; bottom: -10%; inset-inline-start: -60px; width: 110px; border-radius: 50%; background: #fff; }
    .when > * { position: relative; z-index: 1; }
    .when .art { position: absolute; z-index: 0; inset-inline-end: 26px; top: 50%; transform: translateY(-50%); font-size: 8rem;
                 color: rgba(255, 255, 255, .14); pointer-events: none; }
    .when .num { display: inline-flex; align-self: flex-start; padding: 5px 12px; border-radius: 999px; background: rgba(255, 255, 255, .18);
                 font-weight: 700; font-size: .85rem; }
    .when .day { font-size: 1.3rem; font-weight: 800; margin-top: 6px; }
    .when .time { font-size: clamp(2rem, 4.6vw, 2.9rem); font-weight: 900; line-height: 1.1; }
    .chip { display: inline-flex; align-self: flex-start; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 16px; border-radius: 999px;
            background: #22c58b; color: #fff; font-weight: 800; font-size: .92rem; }
    .chip.wait { background: rgba(255, 255, 255, .2); }
    .chip.bad { background: #e5484d; }

    /* Two columns of white panels */
    .grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 20px; align-items: start; }
    .col { display: grid; gap: 20px; }
    .panel { background: #fff; border-radius: 24px; padding: 22px 24px; border: 1px solid rgba(226, 232, 240, .8);
             box-shadow: 0 20px 40px -30px rgba(13, 92, 70, .4); }
    .ph { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: 1.1rem; font-weight: 900; color: #0f172a; }
    .ph i { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: #e2f4ee; color: #0d5c46; font-size: 1rem; }

    .lines { margin: 0; padding: 0; list-style: none; }
    .lines li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px dashed #e8eef0; }
    .lines li:last-child { border-bottom: 0; }
    .lines li.addon { color: #64748b; font-size: .92rem; padding-inline-start: 16px; }
    .lines li.off { color: #0d5c46; font-weight: 700; }
    .lines li.total { margin-top: 6px; padding: 14px 16px; border: 0; border-radius: 16px; background: #eef8f4; font-weight: 900; font-size: 1.1rem; color: #0d5c46; }
    .lines .qty { color: #94a3b8; }
    .vat { color: #94a3b8; font-size: .8rem; margin: 8px 0 0; }

    .facts { margin: 0; display: grid; gap: 14px; }
    .fact { display: flex; gap: 12px; align-items: flex-start; }
    .fact > i { flex: none; width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; background: #f1f7f5; color: #0d5c46; }
    .fact dt { color: #64748b; font-size: .82rem; }
    .fact dd { margin: 2px 0 0; font-weight: 700; color: #0f172a; }
    .fact dd a { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; color: #149b74; font-weight: 700; font-size: .9rem; }

    .inv { display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; border-radius: 18px; border: 1.5px solid #e2ece9;
           background: #fff; font: inherit; color: inherit; cursor: pointer; text-align: start; transition: border-color .2s, background .2s; }
    .inv:hover:not(:disabled) { border-color: #149b74; background: #f7fdfb; }
    .inv > i.pi-receipt { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: #e2f4ee; color: #0d5c46; font-size: 1.15rem; }
    .inv span { flex: 1; line-height: 1.35; font-weight: 700; }
    .inv small { display: block; color: #64748b; font-weight: 500; }
    .inv b { color: #0d5c46; }

    .log { list-style: none; margin: 0; padding: 0; }
    .log li { position: relative; padding: 0 0 18px; padding-inline-start: 28px; font-weight: 600; color: #0f172a; }
    .log li::before { content: ''; position: absolute; inset-inline-start: 3px; top: 6px; width: 12px; height: 12px; border-radius: 50%;
                      background: #149b74; box-shadow: 0 0 0 4px #e2f4ee; }
    .log li:not(:last-child)::after { content: ''; position: absolute; inset-inline-start: 8px; top: 22px; bottom: 2px; width: 2px; background: #e2ece9; }
    .log small { display: block; color: #94a3b8; font-size: .8rem; font-weight: 500; }

    .cancel { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; justify-content: space-between; }
    .cancel p { margin: 0; color: #64748b; font-size: .9rem; }
    .btn-cancel { display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px; border-radius: 999px; border: 1.5px solid #f3c2c2;
                  background: #fff; color: #b42318; font: inherit; font-weight: 800; cursor: pointer; }
    .btn-cancel:hover { background: #fdecec; }
    .late { margin: 0; color: #64748b; font-size: .9rem; }
    .late a { color: #149b74; font-weight: 700; }

    @media (max-width: 899px) {
      .hero, .grid { grid-template-columns: 1fr; }
      .hero .when { order: -1; }
      .when, :host-context([dir='rtl']) .when { padding: 26px; }
      .when::before { display: none; }
    }
    @media (max-width: 599px) {
      .bd { padding: 16px 14px 110px; }
      .track { padding: 22px 16px; }
      .panel { padding: 18px; }
      .when .art { font-size: 5.5rem; }
    }
  `,
  template: `
    <div class="bd">
      <a class="back" [routerLink]="['/', store.slug(), 'bookings']"><i class="pi pi-arrow-right rtl-flip" aria-hidden="true"></i>{{ 'bookings.title' | translate }}</a>

      @if (detail(); as d) {
        <section class="hero">
          <div class="track">
            <pt-visit-tracker [booking]="d.booking" />
            @if (d.cancelReason) { <p class="reason">{{ 'detail.reason' | translate }}: {{ d.cancelReason }}</p> }
          </div>
          <div class="when">
            <i class="pi pi-calendar-clock art" aria-hidden="true"></i>
            <span class="num tnum">#{{ d.booking.number }}</span>
            <span class="day">{{ d.booking.scheduledStart | ldate: 'full' }}</span>
            <span class="time tnum">{{ d.booking.scheduledStart | ldate: 'time' }} – {{ d.booking.scheduledEnd | ldate: 'time' }}</span>
            <span class="chip" [class.wait]="d.booking.status === 'NEW'" [class.bad]="d.booking.status === 'CANCELLED' || d.booking.status === 'NO_SHOW'">
              <i class="pi" [class]="chipIcon(d.booking.status)" aria-hidden="true"></i>{{ 'status.' + d.booking.status | translate }}
            </span>
          </div>
        </section>

        <div class="grid">
          <div class="col">
            <section class="panel">
              <h2 class="ph"><i class="pi pi-sparkles" aria-hidden="true"></i>{{ 'detail.services' | translate }}</h2>
              <ul class="lines">
                @for (it of d.items; track $index) {
                  <li [class.addon]="it.addon"><span>{{ it | itemText }}@if (it.quantity !== 1) { <span class="qty"> × {{ it.quantity }}</span> }</span><span class="ltr">{{ it.totalHalalas | sar }}</span></li>
                }
                @if (d.discountHalalas) {
                  <li class="off"><span>{{ 'promo.discount' | translate: { code: d.promoCode ?? '' } }}</span><span class="ltr">−{{ d.discountHalalas | sar }}</span></li>
                }
                <li class="total"><span>{{ 'detail.total' | translate }}</span><span class="ltr">{{ (d.booking.subtotalHalalas - (d.discountHalalas ?? 0)) | sar }}</span></li>
              </ul>
              @if (store.company()?.vatRegistered && !store.company()?.pricesIncludeVat) { <p class="vat">{{ 'detail.vatNote' | translate }}</p> }
            </section>

            @if (d.invoice; as inv) {
              <section class="panel">
                <h2 class="ph"><i class="pi pi-receipt" aria-hidden="true"></i>{{ 'detail.invoice' | translate }}</h2>
                <button type="button" class="inv" (click)="openInvoice(inv.id)" [disabled]="opening()">
                  <i class="pi pi-receipt" aria-hidden="true"></i>
                  <span>{{ 'invoices.number' | translate: { n: inv.number } }}<small>{{ 'invoiceStatus.' + inv.status | translate }}</small></span>
                  <b class="ltr">{{ inv.totalHalalas | sar }}</b>
                  <i class="pi pi-external-link" style="color:#94a3b8" aria-hidden="true"></i>
                </button>
              </section>
            }

            @if (d.canReview) {
              <section class="panel">
                <h2 class="ph"><i class="pi pi-star" aria-hidden="true"></i>{{ 'rate.title' | translate }}</h2>
                <pt-rate-visit [slug]="store.slug()" [bookingId]="d.booking.id" [review]="d.review" (saved)="reviewed($event)" />
              </section>
            }
          </div>

          <div class="col">
            <section class="panel">
              <h2 class="ph"><i class="pi pi-info-circle" aria-hidden="true"></i>{{ 'detail.details' | translate }}</h2>
              <dl class="facts">
                @if (d.booking.technicians.length) {
                  <div class="fact"><i class="pi pi-user" aria-hidden="true"></i><div><dt>{{ 'detail.technician' | translate }}</dt><dd>{{ techNames() }}</dd></div></div>
                }
                <div class="fact">
                  <i class="pi pi-map-marker" aria-hidden="true"></i>
                  <div>
                    <dt>{{ 'detail.address' | translate }}</dt>
                    <dd>
                      {{ d.booking.addressText || ('detail.noAddress' | translate) }}
                      @if (d.navigationUrl) { <div><a [href]="d.navigationUrl" target="_blank" rel="noopener"><i class="pi pi-directions" aria-hidden="true"></i>{{ 'detail.map' | translate }}</a></div> }
                    </dd>
                  </div>
                </div>
                <div class="fact">
                  <i class="pi pi-wallet" aria-hidden="true"></i>
                  <div><dt>{{ 'detail.payment' | translate }}</dt><dd>{{ d.booking.paymentMethod ? ('payment.' + d.booking.paymentMethod | translate) : ('detail.notSet' | translate) }}</dd></div>
                </div>
                @if (d.notes) {
                  <div class="fact"><i class="pi pi-comment" aria-hidden="true"></i><div><dt>{{ 'detail.notes' | translate }}</dt><dd>{{ d.notes }}</dd></div></div>
                }
              </dl>
            </section>

            <section class="panel">
              <h2 class="ph"><i class="pi pi-history" aria-hidden="true"></i>{{ 'detail.history' | translate }}</h2>
              <ol class="log">
                @for (e of d.events; track $index) {
                  <li>{{ eventText(e) }}<small>{{ e.at | ldate: 'dateTime' }}</small></li>
                }
              </ol>
            </section>

            @if (d.canCancel) {
              <section class="panel cancel">
                <p>{{ 'detail.cancelUntil' | translate: { when: (d.cancelDeadline | ldate: 'dateTime') } }}</p>
                <button type="button" class="btn-cancel" (click)="cancelOpen.set(true)"><i class="pi pi-times" aria-hidden="true"></i>{{ 'detail.cancel' | translate }}</button>
              </section>
            } @else if (['NEW', 'CONFIRMED', 'ASSIGNED'].includes(d.booking.status) && store.company()?.phone) {
              <section class="panel"><p class="late">{{ 'detail.tooLate' | translate }} <a [href]="'tel:' + store.company()?.phone">{{ 'home.call' | translate }}</a></p></section>
            }
          </div>
        </div>
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

  protected chipIcon(s: BookingStatus): string {
    if (s === 'NEW') return 'pi-clock';
    if (s === 'CANCELLED' || s === 'NO_SHOW') return 'pi-times-circle';
    return 'pi-check-circle';
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
