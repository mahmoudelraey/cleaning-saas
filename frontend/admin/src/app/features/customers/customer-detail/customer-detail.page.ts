import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';

import { Address, BookingSummary, CustomerDetail } from '../../../core/api.types';
import { BookingStatusTag } from '../../../shared/booking-status/booking-status';
import { SarPipe } from '../../../shared/format';
import { BookingsApi } from '../../bookings/bookings.api';
import { errorMessage } from '../../../core/http/api-error';
import { PhonePipe } from '../../../shared/format';
import { CustomerFormDialog } from '../customer-form/customer-form.dialog';
import { AddressInput, CustomersApi } from '../customers.api';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { PlacePicker, PlaceValue } from '../../../shared/place-picker/place-picker';

@Component({
  selector: 'app-customer-detail',
  imports: [
    PlacePicker,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    Button,
    Dialog,
    InputText,
    InputNumber,
    PhonePipe,
    CustomerFormDialog,
    BookingStatusTag,
    SarPipe,
    LocalDatePipe,
  ],
  styleUrl: './customer-detail.page.scss',
  templateUrl: './customer-detail.page.html',
})
export class CustomerDetailPage implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly bookingsApi = inject(BookingsApi);
  protected readonly history = signal<BookingSummary[]>([]);

  protected techNames(b: BookingSummary): string {
    return b.technicians.map((t) => t.name).join('، ');
  }
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  /** Route param :id (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly customer = signal<CustomerDetail | null>(null);
  protected readonly editOpen = signal(false);
  protected readonly addressOpen = signal(false);
  protected readonly editingAddress = signal<Address | null>(null);
  protected readonly saving = signal(false);
  /** Old free-text city/district of the address being edited (kept unless a city is picked). */
  protected readonly legacyPlace = signal<string | null>(null);

  protected readonly addressForm = inject(FormBuilder).group({
    label: ['', [Validators.required, Validators.maxLength(50)]],
    place: [{ cityId: null, districtId: null, district: null } as PlaceValue],
    details: [''],
    mapUrl: [''],
    lat: [null as number | null],
    lng: [null as number | null],
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.bookingsApi.list({ customerId: this.id(), page: 0, size: 20 }).subscribe((p) => this.history.set(p.items));
    this.api.get(this.id()).subscribe({
      next: (c) => this.customer.set(c),
      error: (err) => {
        this.toastError(err);
        void this.router.navigate(['/customers']);
      },
    });
  }

  addressLine(a: Address): string {
    return [a.city, a.district, a.details].filter((x) => !!x).join('، ');
  }

  openAddress(a: Address | null): void {
    this.editingAddress.set(a);
    this.legacyPlace.set(a && !a.cityId && (a.city || a.district) ? [a.city, a.district].filter((x) => !!x).join('، ') : null);
    this.addressForm.reset({
      label: a?.label ?? '',
      place: { cityId: a?.cityId ?? null, districtId: a?.districtId ?? null, district: a?.cityId && !a.districtId ? (a.district ?? null) : null },
      details: a?.details ?? '',
      mapUrl: a?.mapUrl ?? '',
      lat: a?.lat ?? null,
      lng: a?.lng ?? null,
    });
    this.addressOpen.set(true);
  }

  saveAddress(): void {
    const c = this.customer();
    if (!c || this.addressForm.invalid) {
      return;
    }
    const v = this.addressForm.getRawValue();
    const place = v.place ?? { cityId: null, districtId: null, district: null };
    const old = this.editingAddress();
    const keepLegacy = !place.cityId && !!old && !old.cityId;
    const body: AddressInput = {
      label: v.label ?? '',
      cityId: place.cityId,
      districtId: place.districtId,
      city: keepLegacy ? (old.city ?? null) : null,
      district: place.district ?? (keepLegacy ? (old.district ?? null) : null),
      details: v.details || null,
      mapUrl: v.mapUrl || null,
      lat: v.lat,
      lng: v.lng,
    };
    const editing = this.editingAddress();
    this.saving.set(true);
    (editing ? this.api.updateAddress(c.id, editing.id, body) : this.api.addAddress(c.id, body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.addressOpen.set(false);
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.toastError(err);
      },
    });
  }

  deleteAddress(a: Address): void {
    const c = this.customer();
    if (!c) {
      return;
    }
    this.confirm.confirm({
      message: this.translate.instant('customers.confirmDeleteAddress', { label: a.label }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.api.deleteAddress(c.id, a.id).subscribe({ next: () => this.reload(), error: (e) => this.toastError(e) }),
    });
  }

  confirmDelete(c: CustomerDetail): void {
    this.confirm.confirm({
      message: this.translate.instant('customers.confirmDelete', { name: c.name }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      accept: () =>
        this.api.delete(c.id).subscribe({
          next: () => void this.router.navigate(['/customers']),
          error: (e) => this.toastError(e),
        }),
    });
  }

  private toastError(err: unknown): void {
    this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
  }
}
