import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { OtpSent, PublicBooked, PublicBookingPage, PublicItem, PublicQuoteResult, PublicSlot } from '../../core/api.types';

export interface PublicBookingInput {
  sessionToken: string;
  name: string;
  items: PublicItem[];
  scheduledStart: string;
  address?: {
    cityId?: number | null;
    districtId?: number | null;
    city?: string | null;
    district?: string | null;
    details?: string | null;
    mapUrl?: string | null;
  };
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PublicBookingApi {
  private readonly http = inject(HttpClient);

  private base(slug: string): string {
    return `/api/v1/public/booking/${encodeURIComponent(slug)}`;
  }

  page(slug: string): Observable<PublicBookingPage> {
    return this.http.get<PublicBookingPage>(this.base(slug));
  }

  quote(slug: string, items: PublicItem[]): Observable<PublicQuoteResult> {
    return this.http.post<PublicQuoteResult>(`${this.base(slug)}/quote`, { items });
  }

  availability(slug: string, date: string, items: PublicItem[]): Observable<PublicSlot[]> {
    return this.http.post<PublicSlot[]>(`${this.base(slug)}/availability`, { date, items });
  }

  sendCode(slug: string, phone: string): Observable<OtpSent> {
    return this.http.post<OtpSent>(`${this.base(slug)}/otp`, { phone });
  }

  verify(slug: string, phone: string, code: string): Observable<string> {
    return this.http
      .post<{ sessionToken: string }>(`${this.base(slug)}/otp/verify`, { phone, code })
      .pipe(map((r) => r.sessionToken));
  }

  book(slug: string, body: PublicBookingInput): Observable<PublicBooked> {
    return this.http.post<PublicBooked>(`${this.base(slug)}/bookings`, body);
  }
}
