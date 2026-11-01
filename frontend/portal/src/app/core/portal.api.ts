import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  Booked,
  BookingDetail,
  BookingSummary,
  Company,
  InvoiceRow,
  Item,
  NewAddress,
  OtpSent,
  PaymentMethod,
  Profile,
  Quote,
  Service,
  Session,
  Slot,
} from './api.types';

@Injectable({ providedIn: 'root' })
export class PortalApi {
  private readonly http = inject(HttpClient);

  private base(slug: string): string {
    return `/api/portal/${encodeURIComponent(slug)}`;
  }

  company(slug: string): Observable<Company> {
    return this.http.get<Company>(this.base(slug));
  }

  sendCode(slug: string, phone: string): Observable<OtpSent> {
    return this.http.post<OtpSent>(`${this.base(slug)}/auth/otp`, { phone });
  }

  verify(slug: string, phone: string, code: string): Observable<Session> {
    return this.http.post<Session>(`${this.base(slug)}/auth/verify`, { phone, code });
  }

  register(slug: string, name: string): Observable<Session> {
    return this.http.post<Session>(`${this.base(slug)}/auth/register`, { name });
  }

  me(slug: string): Observable<Profile> {
    return this.http.get<Profile>(`${this.base(slug)}/me`);
  }

  updateMe(slug: string, name: string, email: string | null): Observable<Profile> {
    return this.http.put<Profile>(`${this.base(slug)}/me`, { name, email });
  }

  bookings(slug: string, scope: 'upcoming' | 'past'): Observable<BookingSummary[]> {
    return this.http.get<BookingSummary[]>(`${this.base(slug)}/bookings`, { params: { scope } });
  }

  booking(slug: string, id: string): Observable<BookingDetail> {
    return this.http.get<BookingDetail>(`${this.base(slug)}/bookings/${id}`);
  }

  cancel(slug: string, id: string, reason: string | null): Observable<Booked> {
    return this.http.post<Booked>(`${this.base(slug)}/bookings/${id}/cancel`, { reason });
  }

  services(slug: string): Observable<Service[]> {
    return this.http.get<Service[]>(`${this.base(slug)}/services`);
  }

  quote(slug: string, items: Item[]): Observable<Quote> {
    return this.http.post<Quote>(`${this.base(slug)}/quote`, { items });
  }

  availability(slug: string, date: string, items: Item[]): Observable<Slot[]> {
    return this.http.post<Slot[]>(`${this.base(slug)}/availability`, { date, items });
  }

  book(
    slug: string,
    body: {
      items: Item[];
      scheduledStart: string;
      addressId?: string | null;
      address?: NewAddress | null;
      notes?: string | null;
      paymentMethod?: PaymentMethod | null;
    },
  ): Observable<Booked> {
    return this.http.post<Booked>(`${this.base(slug)}/bookings`, body);
  }

  invoices(slug: string): Observable<InvoiceRow[]> {
    return this.http.get<InvoiceRow[]>(`${this.base(slug)}/invoices`);
  }

  invoiceLink(slug: string, id: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(`${this.base(slug)}/invoices/${id}/link`, {});
  }
}
