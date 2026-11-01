import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Tag } from 'primeng/tag';

import { InvoiceStatus, QuoteStatus } from '../core/api.types';

type Severity = 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast';

const INVOICE: Record<InvoiceStatus, Severity> = {
  ISSUED: 'warn',
  PARTIALLY_PAID: 'info',
  PAID: 'success',
  VOID: 'secondary',
};

const QUOTE: Record<QuoteStatus, Severity> = {
  DRAFT: 'secondary',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
};

@Component({
  selector: 'app-invoice-status',
  imports: [Tag, TranslatePipe],
  template: `<p-tag [value]="'invoiceStatus.' + status() | translate" [severity]="severity()" />`,
})
export class InvoiceStatusTag {
  readonly status = input.required<InvoiceStatus>();
  protected readonly severity = computed(() => INVOICE[this.status()]);
}

/** Shows "expired" instead of DRAFT/SENT once the validity date has passed. */
@Component({
  selector: 'app-quote-status',
  imports: [Tag, TranslatePipe],
  template: `<p-tag [value]="(expired() ? 'quoteStatus.EXPIRED' : 'quoteStatus.' + status()) | translate" [severity]="expired() ? 'warn' : severity()" />`,
})
export class QuoteStatusTag {
  readonly status = input.required<QuoteStatus>();
  readonly expired = input(false);
  protected readonly severity = computed(() => QUOTE[this.status()]);
}
