import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';

import { Invoice, PaymentMethod } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { TenantService } from '../../core/tenant.service';
import { InvoiceStatusTag } from '../../shared/document-status';
import { SarPipe, toHalalas, toSar } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { BillingApi, openPdf } from './billing.api';
import { DocumentView, invoiceView } from './document-view';

export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'MADA', 'BANK_TRANSFER', 'CARD', 'APPLE_PAY', 'ONLINE', 'OTHER'];

@Component({
  selector: 'app-invoice-detail',
  imports: [
    FormsModule, RouterLink, TranslatePipe, Button, Dialog, Select, InputNumber, InputText, Textarea, DatePicker,
    InvoiceStatusTag, SarPipe, LocalDatePipe, DocumentView,
  ],
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 1rem; align-items: start; }
    @media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } }
    .actions { display: flex; gap: .5rem; flex-wrap: wrap; }
    .back { color: var(--fo-muted); text-decoration: none; display: inline-flex; gap: .35rem; align-items: center; margin-block-end: .75rem; }
    h2 { font-size: 1rem; margin: 0 0 .75rem; }
    .panel + .panel { margin-top: 1rem; }
    .pay { display: flex; justify-content: space-between; gap: .5rem; padding: .5rem 0; border-bottom: 1px solid var(--fo-border); }
    .pay:last-child { border-bottom: none; }
    .kv { display: grid; grid-template-columns: max-content 1fr; gap: .5rem 1rem; margin: 0; }
    .kv dt { color: var(--fo-muted); }
    .kv dd { margin: 0; }
    .balance { font-size: 1.4rem; font-weight: 700; }
  `,
  template: `
    <a routerLink="/invoices" class="back"><i class="pi pi-arrow-right rtl-flip"></i>{{ 'invoices.title' | translate }}</a>
    @if (invoice(); as inv) {
      <div class="page-header">
        <div>
          <h1><span class="ltr">INV-{{ inv.number }}</span> <app-invoice-status [status]="inv.status" /></h1>
          <p>{{ inv.customerName }} · {{ inv.issuedAt | ldate: 'medium' }}</p>
        </div>
        <div class="actions">
          <p-button icon="pi pi-file-pdf" [label]="'doc.pdf' | translate" [outlined]="true" [loading]="pdfBusy()" (onClick)="pdf()" />
          @if (inv.status !== 'VOID') {
            <p-button icon="pi pi-link" [label]="'doc.copyLink' | translate" [outlined]="true" (onClick)="copyLink()" />
            <p-button icon="pi pi-whatsapp" [label]="'doc.sendWhatsapp' | translate" severity="success" [loading]="sending()" (onClick)="send()" />
          }
          @if (inv.status === 'ISSUED' || inv.status === 'PARTIALLY_PAID') {
            <p-button icon="pi pi-wallet" [label]="'invoices.recordPayment' | translate" (onClick)="openPay()" />
          }
          @if (isOwner && inv.status === 'ISSUED') {
            <p-button icon="pi pi-ban" [label]="'invoices.void' | translate" severity="danger" [text]="true" (onClick)="voidOpen.set(true)" />
          }
        </div>
      </div>

      <div class="layout">
        <app-document-view [doc]="view()!" />

        <div>
          <div class="panel">
            <h2>{{ 'doc.balance' | translate }}</h2>
            <div class="balance ltr">{{ inv.balanceHalalas | sar }}</div>
            <p class="muted">{{ 'invoices.paidOf' | translate: { paid: (inv.paidHalalas | sar), total: (inv.totalHalalas | sar) } }}</p>
          </div>

          <div class="panel">
            <h2>{{ 'invoices.payments' | translate }}</h2>
            @for (p of inv.payments; track p.id) {
              <div class="pay">
                <div>
                  {{ 'paymentMethod.' + p.method | translate }}
                  <div class="muted">{{ p.paidAt | ldate: 'medium' }}@if (p.reference) { · <span class="ltr">{{ p.reference }}</span> }</div>
                </div>
                <strong class="ltr">{{ p.amountHalalas | sar }}</strong>
              </div>
            } @empty {
              <p class="muted">{{ 'invoices.noPayments' | translate }}</p>
            }
          </div>

          <div class="panel">
            <h2>{{ 'invoices.details' | translate }}</h2>
            <dl class="kv">
              <dt>{{ 'bookings.customer' | translate }}</dt>
              <dd><a [routerLink]="['/customers', inv.customerId]">{{ inv.customerName }}</a></dd>
              @if (inv.bookingId) {
                <dt>{{ 'invoices.booking' | translate }}</dt>
                <dd><a [routerLink]="['/bookings', inv.bookingId]">{{ 'invoices.openBooking' | translate }}</a></dd>
              }
              @if (inv.quoteId) {
                <dt>{{ 'invoices.quote' | translate }}</dt>
                <dd><a [routerLink]="['/quotes', inv.quoteId]">{{ 'invoices.openQuote' | translate }}</a></dd>
              }
              @if (inv.voidReason) {
                <dt>{{ 'invoices.voidReason' | translate }}</dt>
                <dd>{{ inv.voidReason }}</dd>
              }
              <dt>{{ 'invoices.pricing' | translate }}</dt>
              <dd>{{ (inv.vatInvoice ? (inv.pricesIncludeVat ? 'invoices.vatInclusive' : 'invoices.vatExclusive') : 'invoices.noVat') | translate }}</dd>
            </dl>
          </div>
        </div>
      </div>
    }

    <p-dialog [header]="'invoices.recordPayment' | translate" [(visible)]="payOpen" [modal]="true" [style]="{ width: '440px', maxWidth: '95vw' }" [draggable]="false">
      <div class="form-grid">
        <div class="field full">
          <label for="p-method">{{ 'invoices.method' | translate }}</label>
          <p-select inputId="p-method" [options]="methods()" [(ngModel)]="payMethod" optionLabel="label" optionValue="value" [fluid]="true" appendTo="body" />
        </div>
        <div class="field">
          <label for="p-amount">{{ 'invoices.amountSar' | translate }}</label>
          <p-inputnumber inputId="p-amount" [(ngModel)]="payAmount" [min]="0.01" [max]="maxPay()" [minFractionDigits]="0" [maxFractionDigits]="2" [fluid]="true" />
        </div>
        <div class="field">
          <label for="p-date">{{ 'invoices.paidAt' | translate }}</label>
          <p-datepicker inputId="p-date" [(ngModel)]="payDate" [maxDate]="today" dateFormat="yy-mm-dd" [showIcon]="true" [fluid]="true" appendTo="body" />
        </div>
        <div class="field full">
          <label for="p-ref">{{ 'invoices.reference' | translate }}</label>
          <input pInputText id="p-ref" [(ngModel)]="payRef" maxlength="100" dir="auto" />
        </div>
      </div>
      <div class="dialog-actions">
        <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="payOpen.set(false)" />
        <p-button [label]="'common.save' | translate" [disabled]="!payAmount || payAmount <= 0" [loading]="busy()" (onClick)="pay()" />
      </div>
    </p-dialog>

    <p-dialog [header]="'invoices.void' | translate" [(visible)]="voidOpen" [modal]="true" [style]="{ width: '440px', maxWidth: '95vw' }" [draggable]="false">
      <p class="muted">{{ 'invoices.voidHint' | translate }}</p>
      <div class="field">
        <label for="v-reason">{{ 'invoices.voidReason' | translate }}</label>
        <textarea pTextarea id="v-reason" [(ngModel)]="voidReason" rows="3" maxlength="500"></textarea>
      </div>
      <div class="dialog-actions">
        <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="voidOpen.set(false)" />
        <p-button [label]="'invoices.void' | translate" severity="danger" [disabled]="!voidReason.trim()" [loading]="busy()" (onClick)="doVoid()" />
      </div>
    </p-dialog>
  `,
})
export class InvoiceDetailPage implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly router = inject(Router);
  private readonly tenants = inject(TenantService);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);
  protected readonly isOwner = inject(AuthService).hasRole('OWNER');

  readonly id = input.required<string>();

  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly view = computed(() => {
    const inv = this.invoice();
    return inv ? invoiceView(inv, this.tenants.tenant()) : null;
  });
  protected readonly busy = signal(false);
  protected readonly sending = signal(false);
  protected readonly pdfBusy = signal(false);
  protected readonly payOpen = signal(false);
  protected readonly voidOpen = signal(false);
  protected readonly today = new Date();
  protected readonly maxPay = computed(() => toSar(this.invoice()?.balanceHalalas ?? 0));
  protected readonly methods = computed(() =>
    PAYMENT_METHODS.map((m) => ({ value: m, label: this.translate.instant('paymentMethod.' + m) })),
  );

  protected payMethod: PaymentMethod = 'CASH';
  protected payAmount: number | null = null;
  protected payDate: Date = new Date();
  protected payRef = '';
  protected voidReason = '';

  ngOnInit(): void {
    this.tenants.load().subscribe({ error: () => {} });
    this.reload();
  }

  reload(): void {
    this.api.invoice(this.id()).subscribe({
      next: (i) => this.invoice.set(i),
      error: (e) => {
        this.toast(e);
        void this.router.navigate(['/invoices']);
      },
    });
  }

  pdf(): void {
    const inv = this.invoice();
    if (!inv) return;
    this.pdfBusy.set(true);
    this.api.invoicePdf(inv.id).subscribe({
      next: (b) => {
        this.pdfBusy.set(false);
        openPdf(b, `INV-${inv.number}.pdf`);
      },
      error: (e) => {
        this.pdfBusy.set(false);
        this.toast(e);
      },
    });
  }

  copyLink(): void {
    this.api.invoiceLink(this.id()).subscribe({
      next: (url) => this.copy(url),
      error: (e) => this.toast(e),
    });
  }

  send(): void {
    this.sending.set(true);
    this.api.sendInvoice(this.id()).subscribe({
      next: () => {
        this.sending.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('doc.sentQueued') });
      },
      error: (e) => {
        this.sending.set(false);
        this.toast(e);
      },
    });
  }

  openPay(): void {
    this.payMethod = 'CASH';
    this.payAmount = this.maxPay();
    this.payDate = new Date();
    this.payRef = '';
    this.payOpen.set(true);
  }

  pay(): void {
    const paidAt = sameDay(this.payDate, new Date()) ? null : noonOf(this.payDate).toISOString();
    this.busy.set(true);
    this.api
      .pay(this.id(), { method: this.payMethod, amountHalalas: toHalalas(this.payAmount), reference: this.payRef.trim() || null, paidAt })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.payOpen.set(false);
          this.reload();
        },
        error: (e) => {
          this.busy.set(false);
          this.toast(e);
        },
      });
  }

  doVoid(): void {
    this.busy.set(true);
    this.api.voidInvoice(this.id(), this.voidReason.trim()).subscribe({
      next: (i) => {
        this.busy.set(false);
        this.voidOpen.set(false);
        this.invoice.set(i);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast(e);
      },
    });
  }

  private copy(url: string): void {
    navigator.clipboard?.writeText(url).then(
      () => this.messages.add({ severity: 'success', summary: this.translate.instant('doc.linkCopied') }),
      () => this.messages.add({ severity: 'info', summary: url }),
    );
  }

  private toast(err: unknown): void {
    this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
  }
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** A back-dated payment is recorded at noon that day (never in the future, never ambiguous across zones). */
function noonOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}
