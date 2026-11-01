import { Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { InvoiceRow } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { PortalApi } from '../../core/portal.api';
import { ToastService } from '../../core/toast';

@Component({
  selector: 'pt-invoices',
  imports: [TranslatePipe, LocalDatePipe, SarPipe],
  styles: `
    .row .txt { flex: 1; min-width: 0; }
    .row .txt div { font-weight: 600; }
    .row .txt small { color: var(--ink-2); }
    .row .amt { text-align: end; line-height: 1.3; }
    .row .amt b { display: block; }
    .row .amt small { font-size: .78rem; font-weight: 600; }
    .paid { color: var(--leaf); }
    .due { color: #b7791f; }
    .void { color: var(--ink-3); }
  `,
  template: `
    <div class="page">
      <h1 class="page-title">{{ 'invoices.title' | translate }}</h1>
      <p class="page-sub">{{ 'invoices.lead' | translate }}</p>
      @if (loading()) {
        <div class="spinner"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (rows().length) {
        <div class="rows">
          @for (i of rows(); track i.id) {
            <button type="button" class="row" (click)="open(i)">
              <span class="txt">
                <div>{{ 'invoices.number' | translate: { n: i.number } }}</div>
                <small>{{ i.issuedAt | ldate: 'dayShort' }}@if (i.bookingNumber) { — {{ 'invoices.forBooking' | translate: { n: i.bookingNumber } }} }</small>
              </span>
              <span class="amt">
                <b class="ltr">{{ i.totalHalalas | sar }}</b>
                <small [class]="i.status === 'PAID' ? 'paid' : i.status === 'VOID' ? 'void' : 'due'">{{ 'invoiceStatus.' + i.status | translate }}</small>
              </span>
              <i class="pi pi-external-link muted"></i>
            </button>
          }
        </div>
      } @else {
        <div class="sheet empty"><i class="pi pi-receipt"></i><p>{{ 'invoices.none' | translate }}</p></div>
      }
    </div>
  `,
})
export class InvoicesPage implements OnInit {
  private readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(ToastService);

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

  open(i: InvoiceRow): void {
    const tab = window.open('', '_blank');
    this.api.invoiceLink(this.store.slug(), i.id).subscribe({
      next: (r) => (tab ? (tab.location.href = r.url) : (window.location.href = r.url)),
      error: (e) => {
        tab?.close();
        this.toasts.show(errorMessage(e, this.translate), 'error');
      },
    });
  }
}
