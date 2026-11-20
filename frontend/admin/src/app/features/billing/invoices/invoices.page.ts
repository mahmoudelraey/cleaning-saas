import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { InvoiceSummary } from '../../../core/api.types';
import { InvoiceStatusTag } from '../../../shared/document-status/document-status';
import { SarPipe } from '../../../shared/format';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { BillingApi, openPdf } from '../billing.api';
import { errorMessage } from '../../../core/http/api-error';
import { DetailField, DetailsDialog } from '../../../shared/details-dialog/details-dialog';
import { CreatedBy } from '../../../shared/details-dialog/audit-block';
import { isoDate } from '../../analytics/analytics.api';

@Component({
  selector: 'app-invoices',
  imports: [Tooltip, DetailsDialog, CreatedBy, FormsModule, RouterLink, TranslatePipe, TableModule, Button, SelectButton, DatePicker, IconField, InputIcon, InputText, InvoiceStatusTag, SarPipe, LocalDatePipe],
  styleUrl: './invoices.page.scss',
  templateUrl: './invoices.page.html',
})
export class InvoicesPage {
  private readonly api = inject(BillingApi);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  /** The invoice whose PDF is being generated (spinner on its button). */
  protected readonly pdfBusy = signal<string | null>(null);

  /** Opens the invoice PDF from the table (same as on the invoice page). */
  protected pdf(i: InvoiceSummary, event?: Event): void {
    event?.stopPropagation();
    if (this.pdfBusy()) return;
    this.pdfBusy.set(i.id);
    this.api.invoicePdf(i.id).subscribe({
      next: (b) => {
        this.pdfBusy.set(null);
        openPdf(b, `INV-${i.number}.pdf`);
      },
      error: (e) => {
        this.pdfBusy.set(null);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  protected readonly pageSize = 20;
  protected readonly rows = signal<InvoiceSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected status = '';
  private page = 0;

  /** Search by invoice number ("12" or "INV-12") and by issue date range. */
  protected readonly number$ = new Subject<string>();
  private number = '';
  protected range: Date[] | null = null;

  constructor() {
    this.number$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((v) => {
      this.number = v.trim();
      this.reload();
    });
  }

  /** Reload once both ends of the range are picked (a single day: pick it twice). */
  protected onRange(): void {
    if (this.range?.[0] && this.range[1]) this.reload();
  }

  protected clearRange(): void {
    this.range = null;
    this.reload();
  }

  protected get filtering(): boolean {
    return !!this.number || !!this.range?.[0];
  }

  protected readonly filters = computed(() =>
    ['', 'UNPAID', 'PAID', 'VOID'].map((v) => ({ value: v, label: this.translate.instant('invoices.filter.' + (v || 'ALL')) })),
  );

  load(e: TableLazyLoadEvent): void {
    this.page = Math.floor((e.first ?? 0) / (e.rows ?? this.pageSize));
    this.fetch();
  }

  reload(): void {
    this.page = 0;
    this.fetch();
  }

  open(i: InvoiceSummary): void {
    void this.router.navigate(['/invoices', i.id]);
  }

  isOverdue(i: InvoiceSummary): boolean {
    if (!i.dueDate || i.status === 'PAID' || i.status === 'VOID') {
      return false;
    }
    const today = new Date().toISOString().slice(0, 10);
    return i.dueDate < today;
  }

  private fetch(): void {
    this.loading.set(true);
    const [from, to] = this.range ?? [];
    this.api
      .invoices(this.status || null, this.page, this.pageSize, undefined, {
        number: this.number || null,
        from: from ? isoDate(from) : null,
        to: to ? isoDate(to) : from ? isoDate(from) : null,
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
  protected readonly viewing = signal<InvoiceSummary | null>(null);
  protected readonly viewOpen = signal(false);

  protected view(item: InvoiceSummary, event?: Event): void {
    event?.stopPropagation();
    this.viewing.set(item);
    this.viewOpen.set(true);
  }

  protected viewFields(x: InvoiceSummary): DetailField[] {
    return [
      { label: 'invoices.number', value: 'INV-' + x.number, kind: 'ltr' },
      { label: 'common.status', value: this.translate.instant('invoiceStatus.' + x.status), kind: 'status', on: x.status !== 'VOID' },
      { label: 'invoices.issuedAt', value: x.issuedAt, kind: 'datetime' },
      { label: 'doc.dueDate', value: x.dueDate ?? null, kind: 'date' },
      { label: 'bookings.customer', value: x.customerName },
      { label: 'doc.total', value: x.totalHalalas, kind: 'money' },
      { label: 'doc.balance', value: x.status === 'VOID' ? 0 : x.totalHalalas - x.paidHalalas, kind: 'money' },
    ];
  }

}
