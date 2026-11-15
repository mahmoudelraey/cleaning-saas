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
import { CustomerFormDialog } from './customer-form/customer-form.dialog';
import { CustomersApi } from './customers.api';
import { LocalDatePipe } from '../../shared/local-date.pipe';

@Component({
  selector: 'app-customers',
  imports: [TranslatePipe, TableModule, Button, IconField, InputIcon, InputText, LocalDatePipe, PhonePipe, CustomerFormDialog],
  templateUrl: './customers.page.html',
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
