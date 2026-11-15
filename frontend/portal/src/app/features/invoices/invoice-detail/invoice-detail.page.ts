import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { InvoiceDoc } from '../../../core/api.types';
import { CompanyStore } from '../../../core/company.store';
import { errorMessage } from '../../../core/errors';
import { LocalDatePipe, PhonePipe, SarPipe } from '../../../core/format';
import { PortalApi } from '../../../core/portal.api';
import { ToastService } from '../../../core/toast';

/**
 * One of the customer's invoices inside the portal, in the same bilingual teal design as the PDF, with the PDF a tap
 * away (downloaded through the portal API, so it never leaves the portal for the office app).
 */
@Component({
  selector: 'pt-invoice-detail',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, PhonePipe, SarPipe],
  styleUrl: './invoice-detail.page.scss',
  templateUrl: './invoice-detail.page.html',
})
export class InvoiceDetailPage implements OnInit {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(ToastService);

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly inv = signal<InvoiceDoc | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly downloading = signal(false);

  /** "Invoice", "Simplified tax invoice" or "Tax invoice", as printed on the PDF. */
  protected readonly kind = computed(() => {
    const i = this.inv();
    if (!i?.vatInvoice) return 'plain';
    return i.customerVatNumber ? 'tax' : 'simplified';
  });

  ngOnInit(): void {
    this.api.invoiceDoc(this.store.slug(), this.id()).subscribe({
      next: (i) => {
        this.inv.set(i);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected downloadPdf(): void {
    const i = this.inv();
    if (!i || this.downloading()) return;
    this.downloading.set(true);
    this.api.invoicePdf(this.store.slug(), i.id).subscribe({
      next: (blob) => {
        this.downloading.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `INV-${i.number}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      },
      error: (e) => {
        this.downloading.set(false);
        this.toasts.show(errorMessage(e, this.translate), 'error');
      },
    });
  }

  protected print(): void {
    window.print();
  }
}
