import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { CustomerDetail, CustomerSummary } from '../../core/api.types';
import { PhonePipe } from '../../shared/format';
import { CustomerFormDialog } from './customer-form.dialog';
import { CustomersApi } from './customers.api';
import { LocalDatePipe } from '../../shared/local-date.pipe';

@Component({
  selector: 'app-customers',
  imports: [TranslatePipe, TableModule, Button, IconField, InputIcon, InputText, LocalDatePipe, PhonePipe, CustomerFormDialog],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'customers.title' | translate }}</h1>
        <p>{{ 'customers.subtitle' | translate }}</p>
      </div>
      <p-button icon="pi pi-plus" [label]="'customers.new' | translate" (onClick)="dialogOpen.set(true)" />
    </div>

    <div class="panel-flush">
      <div class="toolbar-row">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input
            pInputText
            type="search"
            [placeholder]="'customers.searchPlaceholder' | translate"
            (input)="search$.next($any($event.target).value)"
          />
        </p-iconfield>
      </div>

      <p-table
        [value]="rows()"
        [lazy]="true"
        (onLazyLoad)="load($event)"
        [paginator]="true"
        [rows]="pageSize"
        [totalRecords]="total()"
        [loading]="loading()"
        [rowHover]="true"
        dataKey="id"
      >
        <ng-template #header>
          <tr>
            <th>{{ 'customers.name' | translate }}</th>
            <th>{{ 'customers.phone' | translate }}</th>
            <th>{{ 'customers.email' | translate }}</th>
            <th>{{ 'common.createdAt' | translate }}</th>
          </tr>
        </ng-template>
        <ng-template #body let-c>
          <tr (click)="open(c)" style="cursor: pointer">
            <td>{{ c.name }}</td>
            <td><span class="ltr">{{ c.phone | phone }}</span></td>
            <td><span class="ltr">{{ c.email }}</span></td>
            <td class="muted">{{ c.createdAt | ldate: 'mediumDate' }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="4">
              <div class="empty"><i class="pi pi-users"></i>{{ 'customers.empty' | translate }}</div>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>

    <app-customer-form-dialog [(visible)]="dialogOpen" (saved)="onCreated($event)" />
  `,
})
export class CustomersPage implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = 20;
  protected readonly rows = signal<CustomerSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly search$ = new Subject<string>();

  private query = '';
  private page = 0;

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => {
        this.query = q;
        this.page = 0;
        this.fetch();
      });
  }

  load(e: TableLazyLoadEvent): void {
    this.page = Math.floor((e.first ?? 0) / (e.rows ?? this.pageSize));
    this.fetch();
  }

  open(c: CustomerSummary): void {
    void this.router.navigate(['/customers', c.id]);
  }

  onCreated(c: CustomerDetail): void {
    void this.router.navigate(['/customers', c.id]);
  }

  private fetch(): void {
    this.loading.set(true);
    this.api.list(this.query, this.page, this.pageSize).subscribe({
      next: (p) => {
        this.rows.set(p.items);
        this.total.set(p.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
