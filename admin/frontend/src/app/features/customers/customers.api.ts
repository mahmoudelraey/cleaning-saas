import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Address, CustomerDetail, CustomerSummary, Page } from '../../core/api.types';

export interface CustomerInput {
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
}

export interface AddressInput {
  label: string;
  city?: string | null;
  district?: string | null;
  cityId?: number | null;
  districtId?: number | null;
  details?: string | null;
  lat?: number | null;
  lng?: number | null;
  mapUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/customers';

  list(q: string, page: number, size: number): Observable<Page<CustomerSummary>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (q.trim()) {
      params = params.set('q', q.trim());
    }
    return this.http.get<Page<CustomerSummary>>(this.base, { params });
  }

  get(id: string): Observable<CustomerDetail> {
    return this.http.get<CustomerDetail>(`${this.base}/${id}`);
  }

  create(body: CustomerInput): Observable<CustomerDetail> {
    return this.http.post<CustomerDetail>(this.base, body);
  }

  update(id: string, body: CustomerInput): Observable<CustomerDetail> {
    return this.http.put<CustomerDetail>(`${this.base}/${id}`, body);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  addAddress(customerId: string, body: AddressInput): Observable<Address> {
    return this.http.post<Address>(`${this.base}/${customerId}/addresses`, body);
  }

  updateAddress(customerId: string, addressId: string, body: AddressInput): Observable<Address> {
    return this.http.put<Address>(`${this.base}/${customerId}/addresses/${addressId}`, body);
  }

  deleteAddress(customerId: string, addressId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${customerId}/addresses/${addressId}`);
  }
}
