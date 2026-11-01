import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BookingStatus } from '../../core/api.types';

export type MediaKind = 'BEFORE' | 'AFTER' | 'OTHER';

export interface MediaItem {
  id: string;
  bookingId: string;
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
  uploadedByName?: string;
  createdAt: string;
}

export interface VisitCard {
  id: string;
  number: number;
  status: BookingStatus;
  scheduledStart: string;
  scheduledEnd: string;
  customerName: string;
  customerPhone: string;
  addressText?: string;
  navigationUrl?: string;
  notes?: string;
  services: string[];
  photoCount: number;
  allowedTransitions: BookingStatus[];
}

@Injectable({ providedIn: 'root' })
export class FieldApi {
  private readonly http = inject(HttpClient);

  myVisits(date: string): Observable<VisitCard[]> {
    return this.http.get<VisitCard[]>('/api/v1/technicians/me/visits', { params: { date } });
  }

  listMedia(bookingId: string): Observable<MediaItem[]> {
    return this.http.get<MediaItem[]>(`/api/v1/bookings/${bookingId}/media`);
  }

  upload(bookingId: string, kind: MediaKind, file: Blob, name: string): Observable<MediaItem> {
    const form = new FormData();
    form.append('file', file, name);
    return this.http.post<MediaItem>(`/api/v1/visits/${bookingId}/media`, form, { params: { kind } });
  }

  /** Photos are behind auth, so they are fetched as blobs (an <img src> cannot send the token). */
  content(id: string): Observable<Blob> {
    return this.http.get(`/api/v1/media/${id}/content`, { responseType: 'blob' });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/media/${id}`);
  }
}
