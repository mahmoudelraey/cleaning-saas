import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { DocumentLine, Invoice, PublicCompany, QrPath, Quote, TenantInfo } from '../../../core/api.types';
import { PhonePipe, SarPipe } from '../../../shared/format';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

/** Everything printed on the paper-style document, independent of invoice vs quote. */
export interface DocView {
  titleKey: string;
  number: string;
  seller: { name: string; vatNumber?: string; cr?: string; address?: string; phone?: string; logoUrl?: string };
  customer: { name: string; phone: string; vatNumber?: string };
  dates: { labelKey: string; value: string; dateOnly?: boolean }[];
  lines: DocumentLine[];
  linesTotalHalalas: number;
  discountHalalas: number;
  taxableHalalas: number;
  vatHalalas: number;
  vatRateBp: number;
  vatDocument: boolean;
  totalHalalas: number;
  paidHalalas?: number;
  balanceHalalas?: number;
  qr?: QrPath;
  notes?: string;
  stampKey?: string;
  stampTone?: 'danger' | 'success';
}

type Seller = Pick<TenantInfo, 'name' | 'vatNumber' | 'commercialRegistration' | 'address' | 'phone' | 'logoUrl'> | PublicCompany;

export function invoiceView(inv: Invoice, company: Seller | null): DocView {
  const titleKey = !inv.vatInvoice ? 'doc.invoice' : inv.customerVatNumber ? 'doc.taxInvoice' : 'doc.simplifiedTaxInvoice';
  return {
    titleKey,
    number: `INV-${inv.number}`,
    // Seller details come from the invoice snapshot, never from today's settings.
    seller: {
      name: inv.sellerName,
      vatNumber: inv.sellerVatNumber,
      cr: inv.sellerCr,
      address: inv.sellerAddress,
      phone: company?.phone,
      logoUrl: company?.logoUrl,
    },
    customer: { name: inv.customerName, phone: inv.customerPhone, vatNumber: inv.customerVatNumber },
    dates: [
      { labelKey: 'doc.issuedAt', value: inv.issuedAt },
      ...(inv.dueDate ? [{ labelKey: 'doc.dueDate', value: inv.dueDate, dateOnly: true }] : []),
    ],
    lines: inv.lines,
    linesTotalHalalas: inv.linesTotalHalalas,
    discountHalalas: inv.discountHalalas,
    taxableHalalas: inv.taxableHalalas,
    vatHalalas: inv.vatHalalas,
    vatRateBp: inv.vatRateBp,
    vatDocument: inv.vatInvoice,
    totalHalalas: inv.totalHalalas,
    paidHalalas: inv.status !== 'VOID' && inv.paidHalalas > 0 ? inv.paidHalalas : undefined,
    balanceHalalas: inv.status !== 'VOID' && inv.paidHalalas > 0 ? inv.balanceHalalas : undefined,
    qr: inv.zatcaQrPath,
    notes: inv.notes,
    stampKey: inv.status === 'VOID' ? 'invoiceStatus.VOID' : inv.status === 'PAID' ? 'invoiceStatus.PAID' : undefined,
    stampTone: inv.status === 'VOID' ? 'danger' : 'success',
  };
}

export function quoteView(q: Quote, company: Seller | null): DocView {
  return {
    titleKey: 'doc.quote',
    number: `Q-${q.number}`,
    seller: {
      name: company?.name ?? '',
      vatNumber: company?.vatNumber,
      cr: company?.commercialRegistration,
      address: company?.address,
      phone: company?.phone,
      logoUrl: company?.logoUrl,
    },
    customer: { name: q.customerName, phone: q.customerPhone },
    dates: [
      { labelKey: 'doc.date', value: q.createdAt },
      { labelKey: 'doc.validUntil', value: q.validUntil, dateOnly: true },
    ],
    lines: q.lines,
    linesTotalHalalas: q.linesTotalHalalas,
    discountHalalas: q.discountHalalas,
    taxableHalalas: q.taxableHalalas,
    vatHalalas: q.vatHalalas,
    vatRateBp: q.vatRateBp,
    vatDocument: q.vatRateBp > 0,
    totalHalalas: q.totalHalalas,
    notes: q.notes,
    stampKey: q.status === 'ACCEPTED' ? 'quoteStatus.ACCEPTED' : q.status === 'REJECTED' ? 'quoteStatus.REJECTED' : undefined,
    stampTone: q.status === 'REJECTED' ? 'danger' : 'success',
  };
}

@Component({
  selector: 'app-document-view',
  imports: [TranslatePipe, SarPipe, PhonePipe, LocalDatePipe],
  styleUrl: './document-view.scss',
  templateUrl: './document-view.html',
})
export class DocumentView {
  readonly doc = input.required<DocView>();
  protected readonly vatPercent = computed(() => this.doc().vatRateBp / 100);
}
