import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import {
  Invoice,
  InvoiceSummary,
  LineInput,
  Page,
  Payment,
  PaymentMethod,
  PublicInvoice,
  PublicQuote,
  Quote,
  QuoteSummary,
} from '../../core/api.types';

export interface InvoiceInput {
  customerId: string;
  lines: LineInput[];
  discountHalalas?: number;
  dueDate?: string | null;
  notes?: string | null;
  customerVatNumber?: string | null;
  send?: boolean;
}

export interface FromBookingInput {
  discountHalalas?: number;
  dueDate?: string | null;
  notes?: string | null;
  customerVatNumber?: string | null;
  send?: boolean;
}

export interface QuoteInput {
  customerId: string;
  bookingId?: string | null;
  lines: LineInput[];
  discountHalalas?: number;
  validUntil?: string | null;
  notes?: string | null;
}

export interface PaymentInput {
  method: PaymentMethod;
  amountHalalas: number;
  reference?: string | null;
  paidAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  // invoices
  invoices(status: string | null, page: number, size: number, customerId?: string): Observable<Page<InvoiceSummary>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) params = params.set('status', status);
    if (customerId) params = params.set('customerId', customerId);
    return this.http.get<Page<InvoiceSummary>>('/api/v1/invoices', { params });
  }

  invoice(id: string): Observable<Invoice> {
    return this.http.get<Invoice>(`/api/v1/invoices/${id}`);
  }

  issue(body: InvoiceInput): Observable<Invoice> {
    return this.http.post<Invoice>('/api/v1/invoices', body);
  }

  issueForBooking(bookingId: string, body: FromBookingInput = {}): Observable<Invoice> {
    return this.http.post<Invoice>(`/api/v1/bookings/${bookingId}/invoice`, body);
  }

  bookingInvoices(bookingId: string): Observable<InvoiceSummary[]> {
    return this.http.get<InvoiceSummary[]>(`/api/v1/bookings/${bookingId}/invoices`);
  }

  pay(id: string, body: PaymentInput): Observable<Payment> {
    return this.http.post<Payment>(`/api/v1/invoices/${id}/payments`, body);
  }

  voidInvoice(id: string, reason: string): Observable<Invoice> {
    return this.http.post<Invoice>(`/api/v1/invoices/${id}/void`, { reason });
  }

  sendInvoice(id: string): Observable<string> {
    return this.http.post<{ url: string }>(`/api/v1/invoices/${id}/send`, {}).pipe(map((r) => r.url));
  }

  invoiceLink(id: string): Observable<string> {
    return this.http.post<{ url: string }>(`/api/v1/invoices/${id}/link`, {}).pipe(map((r) => r.url));
  }

  invoicePdf(id: string): Observable<Blob> {
    return this.http.get(`/api/v1/invoices/${id}/pdf`, { responseType: 'blob' });
  }

  // quotes
  quotes(status: string | null, page: number, size: number, customerId?: string): Observable<Page<QuoteSummary>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) params = params.set('status', status);
    if (customerId) params = params.set('customerId', customerId);
    return this.http.get<Page<QuoteSummary>>('/api/v1/quotes', { params });
  }

  quote(id: string): Observable<Quote> {
    return this.http.get<Quote>(`/api/v1/quotes/${id}`);
  }

  createQuote(body: QuoteInput): Observable<Quote> {
    return this.http.post<Quote>('/api/v1/quotes', body);
  }

  quoteForBooking(bookingId: string): Observable<Quote> {
    return this.http.post<Quote>(`/api/v1/bookings/${bookingId}/quote`, {});
  }

  updateQuote(id: string, body: QuoteInput): Observable<Quote> {
    return this.http.put<Quote>(`/api/v1/quotes/${id}`, body);
  }

  sendQuote(id: string): Observable<string> {
    return this.http.post<{ url: string }>(`/api/v1/quotes/${id}/send`, {}).pipe(map((r) => r.url));
  }

  quoteLink(id: string): Observable<string> {
    return this.http.post<{ url: string }>(`/api/v1/quotes/${id}/link`, {}).pipe(map((r) => r.url));
  }

  respond(id: string, accepted: boolean): Observable<Quote> {
    return this.http.post<Quote>(`/api/v1/quotes/${id}/${accepted ? 'accept' : 'reject'}`, {});
  }

  convertQuote(id: string, send = false): Observable<Invoice> {
    return this.http.post<Invoice>(`/api/v1/quotes/${id}/invoice`, { send });
  }

  quotePdf(id: string): Observable<Blob> {
    return this.http.get(`/api/v1/quotes/${id}/pdf`, { responseType: 'blob' });
  }

  // public (no login)
  publicInvoice(token: string): Observable<PublicInvoice> {
    return this.http.get<PublicInvoice>(`/api/v1/public/invoices/${token}`);
  }

  publicQuote(token: string): Observable<PublicQuote> {
    return this.http.get<PublicQuote>(`/api/v1/public/quotes/${token}`);
  }

  publicRespond(token: string, accepted: boolean): Observable<PublicQuote> {
    return this.http.post<PublicQuote>(`/api/v1/public/quotes/${token}/${accepted ? 'accept' : 'reject'}`, {});
  }
}

/** Opens a PDF blob in a new tab (falls back to download when pop-ups are blocked). */
export function openPdf(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
