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

@Component({
  selector: 'app-quotes',
  imports: [FormsModule, RouterLink, TranslatePipe, TableModule, Button, SelectButton, QuoteStatusTag, SarPipe, LocalDatePipe],
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
}
