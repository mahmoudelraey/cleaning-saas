import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { DocumentLine, Invoice, PublicCompany, QrPath, Quote, TenantInfo } from '../../core/api.types';
import { PhonePipe, SarPipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';

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
  styles: `
    :host { display: block; }
    .paper { position: relative; background: #fff; color: #1f2937; border: 1px solid var(--fo-border); border-radius: 14px;
      padding: 2rem; overflow: hidden; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
    .head { display: flex; justify-content: space-between; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap;
      padding-bottom: 1.25rem; border-bottom: 2px solid #0f766e; }
    .seller { display: grid; gap: .2rem; min-width: 0; justify-items: start; }
    .seller img { max-height: 56px; max-width: 160px; object-fit: contain; margin-bottom: .5rem; }
    .seller strong { font-size: 1.15rem; }
    .small { font-size: .82rem; color: #6b7280; }
    .title { text-align: end; display: grid; gap: .25rem; justify-items: end; }
    .title h2 { margin: 0; color: #0f766e; font-size: 1.5rem; }
    .title .no { font-weight: 700; }
    .party { margin: 1.25rem 0; padding: .875rem 1rem; border: 1px solid #e5e7eb; border-radius: 10px; display: grid; gap: .2rem; justify-items: start; }
    .party .label { color: #0f766e; font-size: .8rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: .92rem; }
    th { background: #f0fdfa; text-align: start; font-weight: 600; padding: .55rem .5rem; border-bottom: 1px solid #0f766e; }
    td { padding: .55rem .5rem; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .idx { color: #9ca3af; width: 2rem; }
    .foot { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 320px); gap: 1.5rem; margin-top: 1.25rem; align-items: start; }
    @media (max-width: 640px) { .unit { display: none; } table { font-size: .85rem; } .foot { grid-template-columns: 1fr; } .paper { padding: 1.25rem; } .title { text-align: start; justify-items: start; } }
    .totals { display: grid; gap: .35rem; }
    .totals .row { display: flex; justify-content: space-between; gap: 1rem; }
    .totals .row span:first-child { color: #6b7280; }
    .totals .grand { border-top: 1.5px solid #1f2937; padding-top: .6rem; margin-top: .25rem; font-weight: 700; font-size: 1.1rem; }
    .totals .grand span:last-child { color: #0f766e; }
    .qr { margin-top: 1rem; display: flex; justify-content: flex-end; }
    .qr svg { width: 120px; height: 120px; }
    .notes h4 { margin: 0 0 .35rem; color: #0f766e; font-size: .85rem; }
    .notes p { margin: 0; white-space: pre-line; }
    .stamp { position: absolute; inset-inline-start: 50%; top: 45%; transform: translate(-50%, -50%) rotate(-28deg);
      font-size: 4.5rem; font-weight: 800; opacity: .1; pointer-events: none; white-space: nowrap; letter-spacing: .05em; }
    :host-context([dir='rtl']) .stamp { transform: translate(50%, -50%) rotate(28deg); }
    .stamp.danger { color: #dc2626; }
    .stamp.success { color: #0f766e; }
  `,
  template: `
    @let d = doc();
    <article class="paper">
      @if (d.stampKey) {
        <div class="stamp" [class]="d.stampTone">{{ d.stampKey | translate }}</div>
      }
      <header class="head">
        <div class="seller">
          @if (d.seller.logoUrl) { <img [src]="d.seller.logoUrl" alt="" /> }
          <strong>{{ d.seller.name }}</strong>
          @if (d.seller.vatNumber) { <span class="small">{{ 'doc.vatNumber' | translate }}: <span class="ltr">{{ d.seller.vatNumber }}</span></span> }
          @if (d.seller.cr) { <span class="small">{{ 'doc.cr' | translate }}: <span class="ltr">{{ d.seller.cr }}</span></span> }
          @if (d.seller.address) { <span class="small">{{ d.seller.address }}</span> }
          @if (d.seller.phone) { <span class="small ltr">{{ d.seller.phone | phone }}</span> }
        </div>
        <div class="title">
          <h2>{{ d.titleKey | translate }}</h2>
          <span class="no ltr">{{ d.number }}</span>
          @for (dt of d.dates; track dt.labelKey) {
            <span class="small">{{ dt.labelKey | translate }}: {{ dt.value | ldate: (dt.dateOnly ? 'dayMonthYear' : 'medium') }}</span>
          }
        </div>
      </header>

      <section class="party">
        <span class="label">{{ 'doc.billTo' | translate }}</span>
        <strong>{{ d.customer.name }}</strong>
        <span class="small ltr">{{ d.customer.phone | phone }}</span>
        @if (d.customer.vatNumber) { <span class="small">{{ 'doc.vatNumber' | translate }}: <span class="ltr">{{ d.customer.vatNumber }}</span></span> }
      </section>

      <table>
        <thead>
          <tr>
            <th class="idx">#</th>
            <th>{{ 'doc.description' | translate }}</th>
            <th class="num">{{ 'doc.qty' | translate }}</th>
            <th class="num unit">{{ 'doc.unitPrice' | translate }}</th>
            <th class="num">{{ 'doc.amount' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          @for (l of d.lines; track $index) {
            <tr>
              <td class="idx">{{ $index + 1 }}</td>
              <td>{{ l.description }}</td>
              <td class="num">{{ l.quantity }}</td>
              <td class="num unit"><span class="ltr">{{ l.unitPriceHalalas | sar }}</span></td>
              <td class="num"><span class="ltr">{{ l.totalHalalas | sar }}</span></td>
            </tr>
          }
        </tbody>
      </table>

      <div class="foot">
        <div class="notes">
          @if (d.notes) {
            <h4>{{ 'doc.notes' | translate }}</h4>
            <p>{{ d.notes }}</p>
          }
        </div>
        <div>
          <div class="totals">
            <div class="row"><span>{{ 'doc.subtotal' | translate }}</span><span class="ltr">{{ d.linesTotalHalalas | sar }}</span></div>
            @if (d.discountHalalas) {
              <div class="row"><span>{{ 'doc.discount' | translate }}</span><span class="ltr">{{ -d.discountHalalas | sar }}</span></div>
            }
            @if (d.vatDocument) {
              <div class="row"><span>{{ 'doc.taxable' | translate }}</span><span class="ltr">{{ d.taxableHalalas | sar }}</span></div>
              <div class="row"><span>{{ 'doc.vat' | translate: { rate: vatPercent() } }}</span><span class="ltr">{{ d.vatHalalas | sar }}</span></div>
            }
            <div class="row grand"><span>{{ 'doc.total' | translate }}</span><span class="ltr">{{ d.totalHalalas | sar }}</span></div>
            @if (d.paidHalalas !== undefined) {
              <div class="row"><span>{{ 'doc.paid' | translate }}</span><span class="ltr">{{ d.paidHalalas | sar }}</span></div>
              <div class="row"><span>{{ 'doc.balance' | translate }}</span><strong class="ltr">{{ d.balanceHalalas | sar }}</strong></div>
            }
          </div>
          @if (d.qr; as qr) {
            <div class="qr" [attr.aria-label]="'doc.zatcaQr' | translate">
              <svg [attr.viewBox]="'-2 -2 ' + (qr.size + 4) + ' ' + (qr.size + 4)" shape-rendering="crispEdges">
                <rect x="-2" y="-2" [attr.width]="qr.size + 4" [attr.height]="qr.size + 4" fill="#fff" />
                <path [attr.d]="qr.d" fill="#000" />
              </svg>
            </div>
          }
        </div>
      </div>
    </article>
  `,
})
export class DocumentView {
  readonly doc = input.required<DocView>();
  protected readonly vatPercent = computed(() => this.doc().vatRateBp / 100);
}
