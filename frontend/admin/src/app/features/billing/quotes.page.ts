import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';

import { QuoteSummary } from '../../core/api.types';
import { QuoteStatusTag } from '../../shared/document-status';
import { SarPipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { BillingApi } from './billing.api';

@Component({
  selector: 'app-quotes',
  imports: [FormsModule, RouterLink, TranslatePipe, TableModule, Button, SelectButton, QuoteStatusTag, SarPipe, LocalDatePipe],
  styles: `.num { font-variant-numeric: tabular-nums; color: var(--fo-muted); }`,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'quotes.title' | translate }}</h1>
        <p>{{ 'quotes.subtitle' | translate }}</p>
      </div>
      <a routerLink="/quotes/new"><p-button icon="pi pi-plus" [label]="'quotes.new' | translate" /></a>
    </div>

    <div class="panel-flush">
      <div class="toolbar-row">
        <p-selectbutton [options]="filters()" [(ngModel)]="status" (onChange)="reload()" optionLabel="label" optionValue="value" [allowEmpty]="false" />
      </div>
      <p-table [value]="rows()" [lazy]="true" (onLazyLoad)="load($event)" [paginator]="true" [rows]="pageSize"
               [totalRecords]="total()" [loading]="loading()" [rowHover]="true" dataKey="id">
        <ng-template #header>
          <tr>
            <th>{{ 'quotes.number' | translate }}</th>
            <th>{{ 'doc.date' | translate }}</th>
            <th>{{ 'bookings.customer' | translate }}</th>
            <th>{{ 'doc.validUntil' | translate }}</th>
            <th>{{ 'doc.total' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
          </tr>
        </ng-template>
        <ng-template #body let-q>
          <tr (click)="open(q)" style="cursor: pointer">
            <td class="num ltr">Q-{{ q.number }}</td>
            <td>{{ q.createdAt | ldate: 'mediumDate' }}</td>
            <td>{{ q.customerName }}</td>
            <td>{{ q.validUntil | ldate: 'dayMonthYear' }}</td>
            <td><span class="ltr">{{ q.totalHalalas | sar }}</span></td>
            <td><app-quote-status [status]="q.status" [expired]="q.expired" /></td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="6"><div class="empty"><i class="pi pi-file-edit"></i>{{ 'quotes.empty' | translate }}</div></td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
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
