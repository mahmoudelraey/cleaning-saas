import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';

import { PublicCompany, PublicInvoice, PublicQuote } from '../../core/api.types';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { BillingApi } from '../billing/billing.api';
import { DocumentView, invoiceView, quoteView } from '../billing/document-view';

/**
 * What the end customer opens from WhatsApp: /i/:token (invoice) or /q/:token (quote, with accept/reject).
 * No login; the token is the credential. Print-friendly.
 */
@Component({
  selector: 'app-public-document',
  imports: [TranslatePipe, Button, DocumentView],
  styles: `
    :host { display: block; min-height: 100vh; background: var(--fo-bg, #f6f7f9); padding: 1rem; }
    .wrap { max-width: 860px; margin: 0 auto; }
    .bar { display: flex; justify-content: space-between; align-items: center; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .company { display: flex; align-items: center; gap: .6rem; font-weight: 600; }
    .company img { height: 36px; max-width: 120px; object-fit: contain; }
    .tools { display: flex; gap: .5rem; flex-wrap: wrap; }
    .respond { margin-top: 1rem; display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; padding: 1rem;
      background: #fff; border: 1px solid var(--fo-border); border-radius: 14px; align-items: center; }
    .respond p { margin: 0; flex-basis: 100%; text-align: center; }
    .state { text-align: center; padding: 4rem 1rem; color: var(--fo-muted); }
    .state i { font-size: 2.5rem; display: block; margin-bottom: 1rem; }
    .powered { text-align: center; color: var(--fo-muted); font-size: .8rem; margin: 1.5rem 0 .5rem; }
    @media print {
      :host { background: #fff; padding: 0; }
      .bar, .respond, .powered { display: none !important; }
    }
  `,
  template: `
    <div class="wrap">
      @if (company(); as c) {
        <div class="bar">
          <div class="company">
            @if (c.logoUrl) { <img [src]="c.logoUrl" alt="" /> }
            <span>{{ c.name }}</span>
          </div>
          <div class="tools">
            <p-button [label]="lang.current() === 'ar' ? 'English' : 'العربية'" [text]="true" size="small" (onClick)="lang.toggle()" />
            <a [href]="pdfUrl()" target="_blank" rel="noopener"><p-button icon="pi pi-download" [label]="'doc.pdf' | translate" [outlined]="true" size="small" /></a>
            <p-button icon="pi pi-print" [label]="'doc.print' | translate" [outlined]="true" size="small" (onClick)="print()" />
            @if (c.phone) {
              <a [href]="'https://wa.me/' + c.phone.replace('+', '')" target="_blank" rel="noopener">
                <p-button icon="pi pi-whatsapp" [label]="'doc.contact' | translate" severity="success" size="small" />
              </a>
            }
          </div>
        </div>
      }

      @if (view(); as v) {
        <app-document-view [doc]="v" />
        @if (quote(); as q) {
          @if ((q.quote.status === 'DRAFT' || q.quote.status === 'SENT') && !q.quote.expired) {
            <div class="respond">
              <p>{{ 'publicDoc.quoteQuestion' | translate }}</p>
              <p-button icon="pi pi-check" [label]="'publicDoc.accept' | translate" severity="success" [loading]="busy()" (onClick)="respond(true)" />
              <p-button icon="pi pi-times" [label]="'publicDoc.reject' | translate" severity="danger" [outlined]="true" [disabled]="busy()" (onClick)="respond(false)" />
            </div>
          } @else if (q.quote.expired) {
            <div class="respond"><p>{{ 'publicDoc.expired' | translate }}</p></div>
          } @else if (q.quote.status === 'ACCEPTED') {
            <div class="respond"><p><i class="pi pi-check-circle" style="color: var(--p-green-600)"></i> {{ 'publicDoc.accepted' | translate }}</p></div>
          } @else if (q.quote.status === 'REJECTED') {
            <div class="respond"><p>{{ 'publicDoc.rejected' | translate }}</p></div>
          }
        }
        <p class="powered">FieldOps</p>
      } @else if (error()) {
        <div class="state"><i class="pi pi-exclamation-circle"></i>{{ error() }}</div>
      } @else {
        <div class="state"><i class="pi pi-spin pi-spinner"></i></div>
      }
    </div>
  `,
})
export class PublicDocumentPage implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  protected readonly lang = inject(LanguageService);

  readonly kind = input<'invoice' | 'quote'>('invoice');
  readonly token = input.required<string>();

  protected readonly invoice = signal<PublicInvoice | null>(null);
  protected readonly quote = signal<PublicQuote | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly company = computed<PublicCompany | null>(
    () => this.invoice()?.company ?? this.quote()?.company ?? null,
  );
  protected readonly view = computed(() => {
    const i = this.invoice();
    if (i) return invoiceView(i.invoice, i.company);
    const q = this.quote();
    return q ? quoteView(q.quote, q.company) : null;
  });
  protected readonly pdfUrl = computed(
    () => `/api/v1/public/${this.kind() === 'invoice' ? 'invoices' : 'quotes'}/${encodeURIComponent(this.token())}/pdf`,
  );

  ngOnInit(): void {
    const onError = (e: unknown) =>
      this.error.set(
        e instanceof HttpErrorResponse && e.status === 404
          ? this.translate.instant('publicDoc.notFound')
          : errorMessage(e, this.translate),
      );
    if (this.kind() === 'invoice') {
      this.api.publicInvoice(this.token()).subscribe({ next: (d) => this.invoice.set(d), error: onError });
    } else {
      this.api.publicQuote(this.token()).subscribe({ next: (d) => this.quote.set(d), error: onError });
    }
  }

  print(): void {
    window.print();
  }

  respond(accepted: boolean): void {
    this.busy.set(true);
    this.api.publicRespond(this.token(), accepted).subscribe({
      next: (d) => {
        this.busy.set(false);
        this.quote.set(d);
      },
      error: (e) => {
        this.busy.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }
}
