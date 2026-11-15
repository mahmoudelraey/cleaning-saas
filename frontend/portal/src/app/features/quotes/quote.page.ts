import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { QuoteDoc } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { LocalDatePipe, SarPipe } from '../../core/format';
import { PortalApi } from '../../core/portal.api';
import { ToastService } from '../../core/toast';

/** A quote the company sent: its lines and total, accepted or declined right here (opened from the bell). */
@Component({
  selector: 'pt-quote',
  imports: [RouterLink, TranslatePipe, LocalDatePipe, SarPipe],
  styleUrl: './quote.page.scss',
  templateUrl: './quote.page.html',
})
export class QuotePage implements OnInit {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(ToastService);

  /** Route param. */
  readonly id = input.required<string>();

  protected readonly quote = signal<QuoteDoc | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);

  /** Still waiting for the customer's answer. */
  protected readonly open = computed(() => {
    const q = this.quote();
    return !!q && q.status === 'SENT' && !q.expired;
  });

  /** SENT / ACCEPTED / REJECTED, or EXPIRED for an unanswered quote past its date. */
  protected readonly state = computed(() => {
    const q = this.quote();
    if (!q) return '';
    return q.status === 'SENT' && q.expired ? 'EXPIRED' : q.status;
  });

  ngOnInit(): void {
    this.api.quoteDoc(this.store.slug(), this.id()).subscribe({
      next: (q) => {
        this.quote.set(q);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected respond(accept: boolean): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.respondToQuote(this.store.slug(), this.id(), accept).subscribe({
      next: (q) => {
        this.quote.set(q);
        this.busy.set(false);
        this.toasts.show(this.translate.instant(accept ? 'quote.acceptedToast' : 'quote.rejectedToast'));
      },
      error: (e) => {
        this.busy.set(false);
        this.toasts.show(errorMessage(e, this.translate), 'error');
      },
    });
  }
}
