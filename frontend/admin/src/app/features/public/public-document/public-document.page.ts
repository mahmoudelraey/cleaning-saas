import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';

import { PublicCompany, PublicInvoice, PublicQuote } from '../../../core/api.types';
import { errorMessage } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { BillingApi } from '../../billing/billing.api';
import { DocumentView, invoiceView, quoteView } from '../../billing/document-view/document-view';
import { portalUrl } from '../../../core/portal';

/**
 * What the end customer opens from WhatsApp: /i/:token (invoice) or /q/:token (quote, with accept/reject).
 * No login; the token is the credential. Print-friendly.
 */
@Component({
  selector: 'app-public-document',
  imports: [TranslatePipe, Button, DocumentView],
  styleUrl: './public-document.page.scss',
  templateUrl: './public-document.page.html',
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

  protected readonly portalLink = portalUrl;
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
