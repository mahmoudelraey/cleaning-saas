import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';

import { Quote } from '../../../core/api.types';
import { errorMessage } from '../../../core/http/api-error';
import { TenantService } from '../../../core/tenant.service';
import { QuoteStatusTag } from '../../../shared/document-status/document-status';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { BillingApi, openPdf } from '../billing.api';
import { DocumentView, quoteView } from '../document-view/document-view';

@Component({
  selector: 'app-quote-detail',
  imports: [RouterLink, TranslatePipe, Button, QuoteStatusTag, LocalDatePipe, DocumentView],
  styleUrl: './quote-detail.page.scss',
  templateUrl: './quote-detail.page.html',
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
