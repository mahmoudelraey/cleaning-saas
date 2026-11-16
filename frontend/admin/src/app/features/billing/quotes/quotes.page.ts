import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';

import { QuoteSummary } from '../../../core/api.types';
import { QuoteStatusTag } from '../../../shared/document-status/document-status';
import { SarPipe } from '../../../shared/format';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { BillingApi } from '../billing.api';
import { DetailField, DetailsDialog } from '../../../shared/details-dialog/details-dialog';
import { CreatedBy } from '../../../shared/details-dialog/audit-block';

@Component({
  selector: 'app-quotes',
  imports: [DetailsDialog, CreatedBy, FormsModule, RouterLink, TranslatePipe, TableModule, Button, SelectButton, QuoteStatusTag, SarPipe, LocalDatePipe],
  styleUrl: './quotes.page.scss',
  templateUrl: './quotes.page.html',
})
export class QuotesPage {
  private readonly api = inject(BillingApi);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly pageSize = 20;
  protected readonly rows = signal<QuoteSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected status = '';
  private page = 0;

  protected readonly filters = computed(() =>
    ['', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'].map((v) => ({
      value: v,
      label: this.translate.instant(v ? 'quoteStatus.' + v : 'invoices.filter.ALL'),
    })),
  );

  load(e: TableLazyLoadEvent): void {
    this.page = Math.floor((e.first ?? 0) / (e.rows ?? this.pageSize));
    this.fetch();
  }

  reload(): void {
    this.page = 0;
    this.fetch();
  }

  open(q: QuoteSummary): void {
    void this.router.navigate(['/quotes', q.id]);
  }

  private fetch(): void {
    this.loading.set(true);
    this.api.quotes(this.status || null, this.page, this.pageSize).subscribe({
      next: (p) => {
        this.rows.set(p.items);
        this.total.set(p.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
  /** Read-only details with who created / last changed the record (eye button in the table). */
  protected readonly viewing = signal<QuoteSummary | null>(null);
  protected readonly viewOpen = signal(false);

  protected view(item: QuoteSummary, event?: Event): void {
    event?.stopPropagation();
    this.viewing.set(item);
    this.viewOpen.set(true);
  }

  protected viewFields(x: QuoteSummary): DetailField[] {
    return [
      { label: 'quotes.number', value: 'Q-' + x.number, kind: 'ltr' },
      { label: 'common.status', value: this.translate.instant(x.expired ? 'quoteStatus.EXPIRED' : 'quoteStatus.' + x.status), kind: 'status', on: !x.expired && x.status !== 'REJECTED' },
      { label: 'doc.date', value: x.createdAt, kind: 'datetime' },
      { label: 'doc.validUntil', value: x.validUntil, kind: 'date' },
      { label: 'bookings.customer', value: x.customerName },
      { label: 'doc.total', value: x.totalHalalas, kind: 'money' },
    ];
  }

}
