import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  BookingDetail,
  BookingInput,
  BookingLineInput,
  BookingStatus,
  BookingSummary,
  CalendarData,
  NotificationLog,
  Page,
  PricePreview,
  Slot,
  VisitEvent,
} from '../../core/api.types';

export interface BookingFilter {
  status?: BookingStatus[];
  from?: string;
  to?: string;
  q?: string;
  customerId?: string;
  technicianId?: string;
  order?: 'asc' | 'desc';
  page: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class BookingsApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/bookings';

  list(f: BookingFilter): Observable<Page<BookingSummary>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size).set('order', f.order ?? 'desc');
    for (const s of f.status ?? []) {
      params = params.append('status', s);
    }
    if (f.from) params = params.set('from', f.from);
    if (f.to) params = params.set('to', f.to);
    if (f.q?.trim()) params = params.set('q', f.q.trim());
    if (f.customerId) params = params.set('customerId', f.customerId);
    if (f.technicianId) params = params.set('technicianId', f.technicianId);
    return this.http.get<Page<BookingSummary>>(this.base, { params });
  }

  get(id: string): Observable<BookingDetail> {
    return this.http.get<BookingDetail>(`${this.base}/${id}`);
  }

  preview(items: BookingLineInput[]): Observable<PricePreview> {
    return this.http.post<PricePreview>(`${this.base}/price-preview`, { items });
  }

  create(body: BookingInput): Observable<BookingDetail> {
    return this.http.post<BookingDetail>(this.base, body);
  }

  update(id: string, body: BookingInput): Observable<BookingDetail> {
    return this.http.put<BookingDetail>(`${this.base}/${id}`, body);
  }

  changeStatus(id: string, status: BookingStatus, reason?: string): Observable<BookingDetail> {
    return this.http.patch<BookingDetail>(`${this.base}/${id}/status`, { status, reason });
  }

  assign(id: string, technicianIds: string[], force = false): Observable<BookingDetail> {
    return this.http.post<BookingDetail>(`${this.base}/${id}/assign`, { technicianIds, force });
  }

  unassign(id: string): Observable<BookingDetail> {
    return this.http.delete<BookingDetail>(`${this.base}/${id}/assign`);
  }

  /** Free-text message to the booking's customer (WhatsApp, SMS fallback), queued like the automatic ones. */
  sendMessage(id: string, message: string): Observable<NotificationLog> {
    return this.http.post<NotificationLog>(`${this.base}/${id}/messages`, { message });
  }

  addNote(id: string, note: string): Observable<VisitEvent> {
    return this.http.post<VisitEvent>(`${this.base}/${id}/notes`, { note });
  }

  calendar(from: string, to: string, includeCancelled = false): Observable<CalendarData> {
    return this.http.get<CalendarData>('/api/v1/scheduling/calendar', {
      params: { from, to, includeCancelled },
    });
  }

  availability(date: string, durationMin: number): Observable<Slot[]> {
    return this.http.get<Slot[]>('/api/v1/scheduling/availability', { params: { date, durationMin } });
  }
}
