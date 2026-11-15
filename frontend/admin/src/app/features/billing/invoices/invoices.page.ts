import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';

import { InvoiceSummary } from '../../../core/api.types';
import { InvoiceStatusTag } from '../../../shared/document-status/document-status';
import { SarPipe } from '../../../shared/format';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { BillingApi } from '../billing.api';

@Component({
  selector: 'app-invoices',
  imports: [FormsModule, RouterLink, TranslatePipe, TableModule, Button, SelectButton, InvoiceStatusTag, SarPipe, LocalDatePipe],
  styleUrl: './invoices.page.scss',
  templateUrl: './invoices.page.html',
})
export class InvoicesPage {
  private readonly api = inject(BillingApi);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly pageSize = 20;
  protected readonly rows = signal<InvoiceSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected status = '';
  private page = 0;

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
    this.api.invoices(this.status || null, this.page, this.pageSize).subscribe({
      next: (p) => {
        this.rows.set(p.items);
        this.total.set(p.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
