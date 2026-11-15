import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { InvoiceRow } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { PortalApi } from '../../core/portal.api';

@Component({
  selector: 'pt-invoices',
  imports: [TranslatePipe, LocalDatePipe, SarPipe],
  styleUrl: './invoices.page.scss',
  templateUrl: './invoices.page.html',
})
export class InvoicesPage implements OnInit {
  private readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);

  protected readonly rows = signal<InvoiceRow[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    this.api.invoices(this.store.slug()).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** The invoice opens inside the portal (with its PDF there). */
  open(i: InvoiceRow): void {
    void this.router.navigate(['/', this.store.slug(), 'invoices', i.id]);
  }
}
