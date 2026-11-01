import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';

import { Quote } from '../../core/api.types';
import { errorMessage } from '../../core/http/api-error';
import { TenantService } from '../../core/tenant.service';
import { QuoteStatusTag } from '../../shared/document-status';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { BillingApi, openPdf } from './billing.api';
import { DocumentView, quoteView } from './document-view';

@Component({
  selector: 'app-quote-detail',
  imports: [RouterLink, TranslatePipe, Button, QuoteStatusTag, LocalDatePipe, DocumentView],
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 1rem; align-items: start; }
    @media (max-width: 1100px) { .layout { grid-template-columns: 1fr; } }
    .actions { display: flex; gap: .5rem; flex-wrap: wrap; }
    .back { color: var(--fo-muted); text-decoration: none; display: inline-flex; gap: .35rem; align-items: center; margin-block-end: .75rem; }
    h2 { font-size: 1rem; margin: 0 0 .75rem; }
    .panel + .panel { margin-top: 1rem; }
    .stack { display: grid; gap: .5rem; }
  `,
  template: `
    <a routerLink="/quotes" class="back"><i class="pi pi-arrow-right rtl-flip"></i>{{ 'quotes.title' | translate }}</a>
    @if (quote(); as q) {
      <div class="page-header">
        <div>
          <h1><span class="ltr">Q-{{ q.number }}</span> <app-quote-status [status]="q.status" [expired]="q.expired" /></h1>
          <p>{{ q.customerName }} · {{ 'doc.validUntil' | translate }} {{ q.validUntil | ldate: 'dayMonthYear' }}</p>
        </div>
        <div class="actions">
          <p-button icon="pi pi-file-pdf" [label]="'doc.pdf' | translate" [outlined]="true" (onClick)="pdf()" />
          @if (open()) {
            <a [routerLink]="['/quotes', q.id, 'edit']"><p-button icon="pi pi-pencil" [label]="'common.edit' | translate" [outlined]="true" /></a>
            <p-button icon="pi pi-link" [label]="'doc.copyLink' | translate" [outlined]="true" (onClick)="copyLink()" />
            <p-button icon="pi pi-whatsapp" [label]="'doc.sendWhatsapp' | translate" severity="success" [loading]="busy()" (onClick)="send()" />
          }
        </div>
      </div>

      <div class="layout">
        <app-document-view [doc]="view()!" />
        <div>
          <div class="panel">
            <h2>{{ 'quotes.nextStep' | translate }}</h2>
            <div class="stack">
              @if (q.invoiceId) {
                <a [routerLink]="['/invoices', q.invoiceId]"><p-button icon="pi pi-file" [label]="'quotes.viewInvoice' | translate" [fluid]="true" /></a>
              } @else if (q.status !== 'REJECTED') {
                <p-button icon="pi pi-file-check" [label]="'quotes.convert' | translate" [fluid]="true" [loading]="busy()" (onClick)="convert()" />
              }
              @if (open()) {
                <p-button icon="pi pi-check" [label]="'quotes.markAccepted' | translate" severity="success" [outlined]="true" [fluid]="true" (onClick)="respond(true)" />
                <p-button icon="pi pi-times" [label]="'quotes.markRejected' | translate" severity="danger" [outlined]="true" [fluid]="true" (onClick)="respond(false)" />
              }
              @if (q.respondedAt) {
                <p class="muted">{{ 'quotes.respondedAt' | translate }} {{ q.respondedAt | ldate: 'medium' }}</p>
              }
            </div>
          </div>
          <div class="panel">
            <h2>{{ 'invoices.details' | translate }}</h2>
            <p><a [routerLink]="['/customers', q.customerId]">{{ q.customerName }}</a></p>
            @if (q.bookingId) { <p><a [routerLink]="['/bookings', q.bookingId]">{{ 'invoices.openBooking' | translate }}</a></p> }
          </div>
        </div>
      </div>
    }
  `,
})
export class QuoteDetailPage implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly router = inject(Router);
  private readonly tenants = inject(TenantService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  readonly id = input.required<string>();
  protected readonly quote = signal<Quote | null>(null);
  protected readonly busy = signal(false);
  protected readonly open = computed(() => ['DRAFT', 'SENT'].includes(this.quote()?.status ?? ''));
  protected readonly view = computed(() => {
    const q = this.quote();
    return q ? quoteView(q, this.tenants.tenant()) : null;
  });

  ngOnInit(): void {
    this.tenants.load().subscribe({ error: () => {} });
    this.reload();
  }

  reload(): void {
    this.api.quote(this.id()).subscribe({
      next: (q) => this.quote.set(q),
      error: (e) => {
        this.toast(e);
        void this.router.navigate(['/quotes']);
      },
    });
  }

  pdf(): void {
    const q = this.quote();
    if (!q) return;
    this.api.quotePdf(q.id).subscribe({ next: (b) => openPdf(b, `Q-${q.number}.pdf`), error: (e) => this.toast(e) });
  }

  copyLink(): void {
    this.api.quoteLink(this.id()).subscribe({
      next: (url) =>
        navigator.clipboard?.writeText(url).then(
          () => this.messages.add({ severity: 'success', summary: this.translate.instant('doc.linkCopied') }),
          () => this.messages.add({ severity: 'info', summary: url }),
        ),
      error: (e) => this.toast(e),
    });
  }

  send(): void {
    this.busy.set(true);
    this.api.sendQuote(this.id()).subscribe({
      next: () => {
        this.busy.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('doc.sentQueued') });
        this.reload();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast(e);
      },
    });
  }

  respond(accepted: boolean): void {
    this.api.respond(this.id(), accepted).subscribe({ next: (q) => this.quote.set(q), error: (e) => this.toast(e) });
  }

  convert(): void {
    this.confirm.confirm({
      message: this.translate.instant('quotes.convertConfirm'),
      acceptLabel: this.translate.instant('quotes.convert'),
      rejectLabel: this.translate.instant('common.cancel'),
      accept: () => {
        this.busy.set(true);
        this.api.convertQuote(this.id()).subscribe({
          next: (inv) => {
            this.busy.set(false);
            void this.router.navigate(['/invoices', inv.id]);
          },
          error: (e) => {
            this.busy.set(false);
            this.toast(e);
          },
        });
      },
    });
  }

  private toast(err: unknown): void {
    this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
  }
}
