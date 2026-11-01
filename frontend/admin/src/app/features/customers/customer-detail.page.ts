import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';

import { Address, BookingSummary, CustomerDetail } from '../../core/api.types';
import { BookingStatusTag } from '../../shared/booking-status';
import { SarPipe } from '../../shared/format';
import { BookingsApi } from '../bookings/bookings.api';
import { errorMessage } from '../../core/http/api-error';
import { PhonePipe } from '../../shared/format';
import { CustomerFormDialog } from './customer-form.dialog';
import { AddressInput, CustomersApi } from './customers.api';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { PlacePicker, PlaceValue } from '../../shared/place-picker';

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
  styles: `
    .layout { display: grid; grid-template-columns: 1fr 1.4fr; gap: 1rem; align-items: start; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: .6rem 1rem; margin: 0; }
    dt { color: var(--fo-muted); }
    dd { margin: 0; white-space: pre-wrap; }
    .panel-title { display: flex; justify-content: space-between; align-items: center; margin-block-end: 1rem; }
    .panel-title h2 { margin: 0; font-size: 1.05rem; }
    .addr { border: 1px solid var(--fo-border); border-radius: 10px; padding: .875rem 1rem; display: flex; gap: 1rem; align-items: start; }
    .addr + .addr { margin-top: .75rem; }
    .addr .info { flex: 1; }
    .addr strong { display: block; margin-block-end: .25rem; }
    .hist-wrap { overflow-x: auto; }
    .hist { display: grid; grid-template-columns: 64px 110px minmax(140px, 1.4fr) minmax(120px, 1fr) 110px 120px; gap: .75rem;
            align-items: center; padding: .65rem .5rem; border-bottom: 1px solid var(--fo-border); color: inherit; text-decoration: none; min-width: 720px; }
    a.hist:hover { background: var(--fo-bg); }
    .hist.head { font-size: .78rem; font-weight: 600; color: var(--fo-muted); padding-block: .4rem; }
    .hist .num { font-weight: 600; }
    .hist .svc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hist .svc small { color: var(--fo-muted); }
    .hist .tech { display: flex; align-items: center; gap: .35rem; min-width: 0; }
    .hist .tech span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hist .end { text-align: end; }
    .back { color: var(--fo-muted); text-decoration: none; display: inline-flex; gap: .35rem; align-items: center; margin-block-end: .75rem; }
  `,
  template: `
    <a routerLink="/customers" class="back"><i class="pi pi-arrow-right rtl-flip"></i>{{ 'customers.title' | translate }}</a>

    @if (customer(); as c) {
      <div class="page-header">
        <div>
          <h1>{{ c.name }}</h1>
          <p><span class="ltr">{{ c.phone | phone }}</span></p>
        </div>
        <div class="row-actions">
          <a [routerLink]="['/bookings/new']" [queryParams]="{ customerId: c.id }"><p-button icon="pi pi-calendar-plus" [label]="'bookings.new' | translate" /></a>
          <p-button icon="pi pi-pencil" [label]="'common.edit' | translate" [outlined]="true" (onClick)="editOpen.set(true)" />
          <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(c)" [ariaLabel]="'common.delete' | translate" />
        </div>
      </div>

      <div class="layout">
        <div class="panel">
          <dl>
            <dt>{{ 'customers.phone' | translate }}</dt>
            <dd><a class="ltr" [href]="'https://wa.me/' + c.phone.replace('+', '')" target="_blank" rel="noopener">{{ c.phone | phone }} <i class="pi pi-whatsapp"></i></a></dd>
            <dt>{{ 'customers.email' | translate }}</dt>
            <dd class="ltr">{{ c.email || '—' }}</dd>
            <dt>{{ 'customers.notes' | translate }}</dt>
            <dd>{{ c.notes || '—' }}</dd>
          </dl>
        </div>

        <div class="panel">
          <div class="panel-title">
            <h2>{{ 'customers.addresses' | translate }}</h2>
            <p-button icon="pi pi-plus" size="small" [label]="'customers.addAddress' | translate" [text]="true" (onClick)="openAddress(null)" />
          </div>
          @for (a of c.addresses; track a.id) {
            <div class="addr">
              <i class="pi pi-map-marker" style="margin-top: 4px"></i>
              <div class="info">
                <strong>{{ a.label }}</strong>
                <span class="muted">{{ addressLine(a) }}</span>
              </div>
              @if (a.navigationUrl) {
                <a [href]="a.navigationUrl" target="_blank" rel="noopener">
                  <p-button icon="pi pi-map" [text]="true" size="small" [ariaLabel]="'customers.openMap' | translate" />
                </a>
              }
              <p-button icon="pi pi-pencil" [text]="true" size="small" severity="secondary" (onClick)="openAddress(a)" />
              <p-button icon="pi pi-trash" [text]="true" size="small" severity="danger" (onClick)="deleteAddress(a)" />
            </div>
          } @empty {
            <div class="empty"><i class="pi pi-map"></i>{{ 'customers.noAddresses' | translate }}</div>
          }
        </div>
      </div>

      <div class="panel" style="margin-top: 1rem">
        <div class="panel-title"><h2>{{ 'customers.history' | translate }}</h2></div>
        @if (history().length) {
          <div class="hist-wrap">
            <div class="hist head">
              <span>#</span>
              <span>{{ 'bookings.when' | translate }}</span>
              <span>{{ 'bookings.service' | translate }}</span>
              <span>{{ 'customers.technician' | translate }}</span>
              <span class="end">{{ 'bookings.amount' | translate }}</span>
              <span>{{ 'common.status' | translate }}</span>
            </div>
            @for (bk of history(); track bk.id) {
              <a class="hist" [routerLink]="['/bookings', bk.id]">
                <span class="num">#{{ bk.number }}</span>
                <span>{{ bk.scheduledStart | ldate: 'mediumDate' }}</span>
                <span class="svc" [title]="(bk.services ?? []).join('، ')">
                  @if (bk.services?.length) {
                    {{ bk.services![0] }}
                    @if (bk.services!.length > 1) { <small>+{{ bk.services!.length - 1 }}</small> }
                  } @else { — }
                </span>
                <span class="tech" [title]="techNames(bk)">
                  @if (bk.technicians.length) {
                    <span class="color-dot" [style.background]="bk.technicians[0].color"></span>
                    <span>{{ techNames(bk) }}</span>
                  } @else {
                    <span class="muted">{{ 'customers.unassigned' | translate }}</span>
                  }
                </span>
                <span class="end"><span class="ltr">{{ bk.subtotalHalalas | sar }}</span></span>
                <app-booking-status [status]="bk.status" />
              </a>
            }
          </div>
        } @else {
          <div class="empty"><i class="pi pi-inbox"></i>{{ 'customers.noHistory' | translate }}</div>
        }
      </div>

      <app-customer-form-dialog [(visible)]="editOpen" [customer]="c" (saved)="customer.set($event)" />
    }

    <p-dialog
      [header]="(editingAddress() ? 'customers.editAddress' : 'customers.addAddress') | translate"
      [(visible)]="addressOpen"
      [modal]="true"
      [style]="{ width: '560px', maxWidth: '95vw' }"
      [draggable]="false"
    >
      <form [formGroup]="addressForm" (ngSubmit)="saveAddress()" class="form-grid">
        <div class="field">
          <label for="a-label">{{ 'customers.addressLabel' | translate }}</label>
          <input pInputText id="a-label" formControlName="label" [placeholder]="'customers.addressLabelHint' | translate" />
        </div>
        <app-place-picker class="full" formControlName="place" idPrefix="a" />
        @if (legacyPlace()) {
          <small class="hint full">{{ 'geo.legacy' | translate: { place: legacyPlace() } }}</small>
        }
        <div class="field">
          <label for="a-map">{{ 'customers.mapUrl' | translate }}</label>
          <input pInputText id="a-map" formControlName="mapUrl" dir="ltr" placeholder="https://maps.app.goo.gl/…" />
        </div>
        <div class="field full">
          <label for="a-details">{{ 'customers.details' | translate }}</label>
          <input pInputText id="a-details" formControlName="details" />
        </div>
        <div class="field">
          <label for="a-lat">{{ 'customers.lat' | translate }}</label>
          <p-inputnumber inputId="a-lat" formControlName="lat" [minFractionDigits]="0" [maxFractionDigits]="6" [min]="-90" [max]="90" [useGrouping]="false" />
        </div>
        <div class="field">
          <label for="a-lng">{{ 'customers.lng' | translate }}</label>
          <p-inputnumber inputId="a-lng" formControlName="lng" [minFractionDigits]="0" [maxFractionDigits]="6" [min]="-180" [max]="180" [useGrouping]="false" />
        </div>
        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="addressOpen.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [disabled]="addressForm.invalid" [loading]="saving()" />
        </div>
      </form>
    </p-dialog>
  `,
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
