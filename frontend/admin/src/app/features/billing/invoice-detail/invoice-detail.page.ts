import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { AppDialog } from '../../../shared/dialog/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';

import { Invoice, PaymentMethod } from '../../../core/api.types';
import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../core/http/api-error';
import { TenantService } from '../../../core/tenant.service';
import { InvoiceStatusTag } from '../../../shared/document-status/document-status';
import { SarPipe, toHalalas, toSar } from '../../../shared/format';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { BillingApi, openPdf } from '../billing.api';
import { DocumentView, invoiceView } from '../document-view/document-view';

export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'MADA', 'BANK_TRANSFER', 'CARD', 'APPLE_PAY', 'ONLINE', 'OTHER'];

@Component({
  selector: 'app-invoice-detail',
  imports: [
    FormsModule, RouterLink, TranslatePipe, Button, AppDialog, Select, InputNumber, InputText, Textarea, DatePicker,
    InvoiceStatusTag, SarPipe, LocalDatePipe, DocumentView,
  ],
  styleUrl: './invoice-detail.page.scss',
  templateUrl: './invoice-detail.page.html',
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
