import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';

import { InvoiceSummary } from '../../core/api.types';
import { InvoiceStatusTag } from '../../shared/document-status';
import { SarPipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { BillingApi } from './billing.api';

@Component({
  selector: 'app-invoices',
  imports: [FormsModule, RouterLink, TranslatePipe, TableModule, Button, SelectButton, InvoiceStatusTag, SarPipe, LocalDatePipe],
  styles: `
    .num { font-variant-numeric: tabular-nums; color: var(--fo-muted); }
    .overdue { color: var(--p-red-600); font-size: .8rem; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'invoices.title' | translate }}</h1>
        <p>{{ 'invoices.subtitle' | translate }}</p>
      </div>
      <a routerLink="/invoices/new"><p-button icon="pi pi-plus" [label]="'invoices.new' | translate" /></a>
    </div>

    <div class="panel-flush">
      <div class="toolbar-row">
        <p-selectbutton [options]="filters()" [(ngModel)]="status" (onChange)="reload()" optionLabel="label" optionValue="value" [allowEmpty]="false" />
      </div>
      <p-table [value]="rows()" [lazy]="true" (onLazyLoad)="load($event)" [paginator]="true" [rows]="pageSize"
               [totalRecords]="total()" [loading]="loading()" [rowHover]="true" dataKey="id">
        <ng-template #header>
          <tr>
            <th>{{ 'invoices.number' | translate }}</th>
            <th>{{ 'invoices.issuedAt' | translate }}</th>
            <th>{{ 'bookings.customer' | translate }}</th>
            <th>{{ 'doc.total' | translate }}</th>
            <th>{{ 'doc.balance' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
          </tr>
        </ng-template>
        <ng-template #body let-i>
          <tr (click)="open(i)" style="cursor: pointer">
            <td class="num ltr">INV-{{ i.number }}</td>
            <td>
              {{ i.issuedAt | ldate: 'mediumDate' }}
              @if (isOverdue(i)) { <div class="overdue">{{ 'invoices.overdue' | translate }}</div> }
            </td>
            <td>{{ i.customerName }}</td>
            <td><span class="ltr">{{ i.totalHalalas | sar }}</span></td>
            <td><span class="ltr">{{ (i.status === 'VOID' ? 0 : i.totalHalalas - i.paidHalalas) | sar }}</span></td>
            <td><app-invoice-status [status]="i.status" /></td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="6"><div class="empty"><i class="pi pi-file"></i>{{ 'invoices.empty' | translate }}</div></td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
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
