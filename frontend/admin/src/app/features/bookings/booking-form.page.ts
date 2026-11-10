import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { Subject, debounceTime, switchMap, of, catchError } from 'rxjs';

import {
  Address,
  BookingDetail,
  BookingInput,
  CustomerDetail,
  CustomerSummary,
  PaymentMethod,
  PricePreview,
  ServiceOffering,
  Technician,
} from '../../core/api.types';
import { LanguageService } from '../../core/i18n/language.service';
import { errorMessage } from '../../core/http/api-error';
import { PhonePipe, SarPipe } from '../../shared/format';
import { CustomersApi } from '../customers/customers.api';
import { BookingsApi } from './bookings.api';
import { doesAnyService } from '../../shared/technician-services';

interface Line {
  serviceId: string | null;
  quantity: number | null;
  addonIds: string[];
}

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'MADA', 'CARD', 'APPLE_PAY', 'ONLINE', 'OTHER'];

@Component({
  selector: 'app-booking-form',
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    AutoComplete,
    Button,
    Checkbox,
    DatePicker,
    InputNumber,
    MultiSelect,
    Select,
    Textarea,
    PhonePipe,
    SarPipe,
  ],
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
    h2 { font-size: 1.05rem; margin: 0 0 1rem; }
    .panel + .panel { margin-top: 1rem; }
    .line { border: 1px solid var(--fo-border); border-radius: 10px; padding: .875rem; display: grid; gap: .75rem; }
    .line + .line { margin-top: .75rem; }
    .line-head { display: grid; grid-template-columns: minmax(0, 1fr) 140px auto; gap: .5rem; align-items: end; }
    @media (max-width: 480px) { .line-head { grid-template-columns: minmax(0, 1fr) auto; } .line-head > :first-child { grid-column: 1 / -1; } }
    .addons { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; }
    .addons label { display: inline-flex; gap: .4rem; align-items: center; cursor: pointer; }
    .summary-row { display: flex; justify-content: space-between; gap: 1rem; padding: .35rem 0; }
    .summary-row.total { border-top: 1px solid var(--fo-border); margin-top: .5rem; padding-top: .75rem; font-weight: 700; font-size: 1.1rem; }
    .sticky { position: sticky; top: 76px; }
    .back { color: var(--fo-muted); text-decoration: none; display: inline-flex; gap: .35rem; align-items: center; margin-block-end: .75rem; }
    .cust-option small { color: var(--fo-muted); margin-inline-start: .5rem; }
  `,
  template: `
    <a [routerLink]="id() ? ['/bookings', id()] : ['/bookings']" class="back">
      <i class="pi pi-arrow-right rtl-flip"></i>{{ 'bookings.title' | translate }}
    </a>
    <div class="page-header">
      <div>
        <h1>{{ (id() ? 'bookings.edit' : 'bookings.new') | translate }}</h1>
      </div>
    </div>

    <div class="layout">
      <div>
        <div class="panel">
          <h2>{{ 'bookings.customer' | translate }}</h2>
          <div class="form-grid">
            <div class="field full">
              <label for="b-cust">{{ 'bookings.customer' | translate }}</label>
              <p-autocomplete
                inputId="b-cust"
                [(ngModel)]="customerPick"
                [suggestions]="customerSuggestions()"
                (completeMethod)="searchCustomers($event)"
                (onSelect)="pickCustomer($event.value)"
                optionLabel="name"
                [forceSelection]="true"
                [placeholder]="'bookings.customerSearch' | translate"
                [fluid]="true"
              >
                <ng-template #item let-c>
                  <span class="cust-option">{{ c.name }}<small class="ltr">{{ c.phone | phone }}</small></span>
                </ng-template>
              </p-autocomplete>
              <small class="hint">{{ 'bookings.customerHint' | translate }}</small>
            </div>
            <div class="field full">
              <label for="b-pay">{{ 'bookings.paymentMethod' | translate }}</label>
              <p-select
                inputId="b-pay"
                [options]="paymentOptions()"
                [(ngModel)]="paymentMethod"
                optionLabel="label"
                optionValue="value"
                [showClear]="true"
                [placeholder]="'bookings.paymentNotSet' | translate"
              />
            </div>
            <div class="field full">
              <label for="b-addr">{{ 'bookings.address' | translate }}</label>
              <p-select
                inputId="b-addr"
                [options]="addresses()"
                [(ngModel)]="addressId"
                optionLabel="label"
                optionValue="id"
                [showClear]="true"
                [placeholder]="'bookings.noAddress' | translate"
                [disabled]="!customer()"
              />
            </div>
          </div>
        </div>

        <div class="panel">
          <h2>{{ 'bookings.services' | translate }}</h2>
          @for (line of lines(); track $index; let i = $index) {
            <div class="line">
              <div class="line-head">
                <div class="field">
                  <label>{{ 'bookings.service' | translate }}</label>
                  <p-select
                    [options]="services()"
                    [(ngModel)]="line.serviceId"
                    (onChange)="onServiceChange(line)"
                    optionLabel="name"
                    optionValue="id"
                    [placeholder]="'bookings.chooseService' | translate"
                    [filter]="true"
                    filterBy="name"
                  />
                </div>
                <div class="field">
                  <label>{{ quantityLabel(line) | translate }}</label>
                  <p-inputnumber
                    [(ngModel)]="line.quantity"
                    (onInput)="refreshPreview()"
                    [min]="0"
                    [maxFractionDigits]="isFixed(line) ? 0 : 2"
                    [showButtons]="isFixed(line)"
                    [useGrouping]="false"
                  />
                </div>
                <p-button icon="pi pi-trash" [text]="true" severity="danger" (onClick)="removeLine(i)" [disabled]="lines().length === 1" />
              </div>
              @if (serviceOf(line); as s) {
                @if (activeAddons(s).length) {
                  <div class="addons">
                    @for (a of activeAddons(s); track a.id) {
                      <label>
                        <p-checkbox [value]="a.id" [(ngModel)]="line.addonIds" (onChange)="refreshPreview()" />
                        {{ a.name }} <span class="muted ltr">+{{ a.priceHalalas | sar }}</span>
                      </label>
                    }
                  </div>
                }
              }
            </div>
          }
          <p-button icon="pi pi-plus" [text]="true" size="small" [label]="'bookings.addService' | translate" (onClick)="addLine()" />
        </div>

        <div class="panel">
          <h2>{{ 'bookings.schedule' | translate }}</h2>
          <div class="form-grid">
            <div class="field">
              <label for="b-start">{{ 'bookings.when' | translate }}</label>
              <p-datepicker
                inputId="b-start"
                [(ngModel)]="start"
                (onSelect)="onScheduleChange()"
                [showTime]="true"
                hourFormat="12"
                [stepMinute]="15"
                [showIcon]="true"
                dateFormat="yy-mm-dd"
                [fluid]="true"
              />
            </div>
            <div class="field">
              <label for="b-dur">{{ 'bookings.durationMin' | translate }}</label>
              <p-inputnumber
                inputId="b-dur"
                [(ngModel)]="duration"
                (onInput)="durationTouched = true; onScheduleChange()"
                [min]="15"
                [max]="1440"
                [step]="15"
                [showButtons]="true"
              />
              @if (!durationTouched) {
                <small class="hint">{{ 'bookings.durationAuto' | translate }}</small>
              }
            </div>
            <div class="field full">
              <label for="b-tech">{{ 'bookings.technicians' | translate }}</label>
              <p-multiselect
                inputId="b-tech"
                [options]="technicianOptions()"
                [(ngModel)]="technicianIds"
                optionLabel="label"
                optionValue="value"
                display="chip"
                [placeholder]="'bookings.assignLater' | translate"
                [disabled]="!!id()"
              />
              <small class="hint">{{ (id() ? 'bookings.assignFromDetail' : 'bookings.freeHint') | translate }}</small>
            </div>
          </div>
        </div>

        <div class="panel">
          <h2>{{ 'bookings.notesTitle' | translate }}</h2>
          <div class="form-grid">
            <div class="field full">
              <label for="b-notes">{{ 'bookings.notes' | translate }}</label>
              <textarea pTextarea id="b-notes" [(ngModel)]="notes" rows="2"></textarea>
            </div>
            <div class="field full">
              <label for="b-inotes">{{ 'bookings.internalNotes' | translate }}</label>
              <textarea pTextarea id="b-inotes" [(ngModel)]="internalNotes" rows="2"></textarea>
              <small class="hint">{{ 'bookings.internalHint' | translate }}</small>
            </div>
          </div>
        </div>
      </div>

      <div class="panel sticky">
        <h2>{{ 'bookings.summary' | translate }}</h2>
        @if (preview(); as p) {
          @for (it of p.items; track $index) {
            <div class="summary-row">
              <span>{{ it.description }} @if (it.quantity !== 1) {<span class="muted">× {{ it.quantity }}</span>}</span>
              <span class="ltr">{{ it.totalHalalas | sar }}</span>
            </div>
          }
          <div class="summary-row total">
            <span>{{ 'bookings.subtotal' | translate }}</span>
            <span class="ltr">{{ p.subtotalHalalas | sar }}</span>
          </div>
          <div class="summary-row muted">
            <span>{{ 'bookings.vatNote' | translate }}</span>
          </div>
        } @else {
          <p class="muted">{{ previewError() ?? ('bookings.chooseServiceFirst' | translate) }}</p>
        }
        <div class="dialog-actions">
          <p-button
            [label]="(id() ? 'common.save' : 'bookings.create') | translate"
            icon="pi pi-check"
            [loading]="saving()"
            [disabled]="!canSave()"
            (onClick)="save(false)"
            [fluid]="true"
          />
        </div>
      </div>
    </div>
  `,
})
export class BookingFormPage implements OnInit {
  private readonly api = inject(BookingsApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  /** Route param :id when editing; query param ?customerId= to prefill. */
  readonly id = input<string>();
  readonly customerId = input<string>();

  protected readonly services = signal<ServiceOffering[]>([]);
  protected readonly technicians = signal<Technician[]>([]);
  protected readonly freeTechIds = signal<Set<string> | null>(null);
  protected readonly customer = signal<CustomerDetail | null>(null);
  protected readonly customerSuggestions = signal<CustomerSummary[]>([]);
  protected readonly lines = signal<Line[]>([{ serviceId: null, quantity: 1, addonIds: [] }]);
  protected readonly preview = signal<PricePreview | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected customerPick: CustomerSummary | null = null;
  protected addressId: string | null = null;
  protected start: Date | null = null;
  protected duration: number | null = null;
  protected durationTouched = false;
  protected technicianIds: string[] = [];
  protected notes = '';
  protected internalNotes = '';
  protected paymentMethod: PaymentMethod | null = null;
  /** Re-labelled when the UI language changes. */
  protected readonly paymentOptions = computed(() => {
    this.lang.current();
    return PAYMENT_METHODS.map((m) => ({ value: m, label: this.translate.instant('paymentMethod.' + m) }));
  });

  private readonly preview$ = new Subject<void>();

  protected readonly addresses = computed<Address[]>(() => this.customer()?.addresses ?? []);
  protected readonly technicianOptions = computed(() => {
    const free = this.freeTechIds();
    const wanted = new Set(this.lines().map((l) => l.serviceId).filter((id): id is string => !!id));
    return this.technicians()
      .filter((t) => t.active && (doesAnyService(t, wanted) || this.technicianIds.includes(t.id)))
      .map((t) => ({
        value: t.id,
        label:
          free === null
            ? t.name
            : `${t.name} — ${this.translate.instant(free.has(t.id) ? 'bookings.free' : 'bookings.busy')}`,
      }));
  });

  ngOnInit(): void {
    this.http.get<ServiceOffering[]>('/api/v1/services', { params: { activeOnly: true } }).subscribe((s) => this.services.set(s));
    this.http.get<Technician[]>('/api/v1/technicians').subscribe((t) => this.technicians.set(t));

    this.preview$
      .pipe(
        debounceTime(250),
        switchMap(() => {
          const items = this.validLines();
          if (!items.length) {
            return of(null);
          }
          return this.api.preview(items).pipe(
            catchError((err) => {
              this.previewError.set(errorMessage(err, this.translate));
              return of(null);
            }),
          );
        }),
      )
      .subscribe((p) => {
        this.preview.set(p);
        if (p) {
          this.previewError.set(null);
          if (!this.durationTouched) {
            this.duration = p.durationMin;
            this.checkAvailability();
          }
        }
      });

    const id = this.id();
    if (id) {
      this.api.get(id).subscribe((b) => this.fillFrom(b));
    } else if (this.customerId()) {
      this.customersApi.get(this.customerId()!).subscribe((c) => {
        this.customer.set(c);
        this.customerPick = c;
      });
    }
  }

  searchCustomers(e: AutoCompleteCompleteEvent): void {
    this.customersApi.list(e.query, 0, 10).subscribe((p) => this.customerSuggestions.set(p.items));
  }

  pickCustomer(c: CustomerSummary): void {
    this.customersApi.get(c.id).subscribe((detail) => {
      this.customer.set(detail);
      this.addressId = detail.addresses.length === 1 ? detail.addresses[0].id : null;
    });
  }

  serviceOf(line: Line): ServiceOffering | undefined {
    return this.services().find((s) => s.id === line.serviceId);
  }

  activeAddons(s: ServiceOffering) {
    return s.addons.filter((a) => a.active);
  }

  isFixed(line: Line): boolean {
    return (this.serviceOf(line)?.pricingType ?? 'FIXED') === 'FIXED';
  }

  quantityLabel(line: Line): string {
    const type = this.serviceOf(line)?.pricingType ?? 'FIXED';
    return type === 'HOURLY' ? 'bookings.hours' : type === 'PER_SQM' ? 'bookings.sqm' : 'bookings.count';
  }

  onServiceChange(line: Line): void {
    line.addonIds = [];
    line.quantity = this.isFixed(line) ? 1 : null;
    this.lines.set([...this.lines()]);
    this.refreshPreview();
  }

  addLine(): void {
    this.lines.set([...this.lines(), { serviceId: null, quantity: 1, addonIds: [] }]);
  }

  removeLine(i: number): void {
    this.lines.set(this.lines().filter((_, idx) => idx !== i));
    this.refreshPreview();
  }

  refreshPreview(): void {
    this.preview$.next();
  }

  onScheduleChange(): void {
    this.checkAvailability();
  }

  canSave(): boolean {
    return !!this.customer() && !!this.start && !!this.preview() && !this.saving();
  }

  save(force: boolean): void {
    const c = this.customer();
    if (!c || !this.start) {
      return;
    }
    const body: BookingInput = {
      customerId: c.id,
      addressId: this.addressId,
      scheduledStart: this.start.toISOString(),
      durationMin: this.durationTouched ? this.duration : null,
      items: this.validLines(),
      notes: this.notes || null,
      internalNotes: this.internalNotes || null,
      paymentMethod: this.paymentMethod,
      technicianIds: this.id() ? undefined : this.technicianIds,
      force,
    };
    const id = this.id();
    this.saving.set(true);
    (id ? this.api.update(id, body) : this.api.create(body)).subscribe({
      next: (b) => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
        void this.router.navigate(['/bookings', b.id]);
      },
      error: (err) => {
        this.saving.set(false);
        if (err instanceof HttpErrorResponse && err.error?.code === 'outside_work_hours' && !force) {
          this.confirm.confirm({
            message: `${errorMessage(err, this.translate)}. ${this.translate.instant('bookings.forceQuestion')}`,
            acceptLabel: this.translate.instant('bookings.forceYes'),
            rejectLabel: this.translate.instant('common.cancel'),
            accept: () => this.save(true),
          });
          return;
        }
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }

  private validLines() {
    return this.lines()
      .filter((l) => !!l.serviceId)
      .map((l) => ({ serviceId: l.serviceId!, quantity: l.quantity, addonIds: l.addonIds }));
  }

  /** Marks which technicians are free at the chosen start (calls the availability endpoint for that day). */
  private checkAvailability(): void {
    if (!this.start || !this.duration) {
      this.freeTechIds.set(null);
      return;
    }
    const d = this.start;
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const startIso = d.toISOString();
    this.api.availability(date, this.duration).subscribe({
      next: (slots) => {
        const slot = slots.find((s) => new Date(s.start).getTime() === new Date(startIso).getTime());
        this.freeTechIds.set(new Set(slot?.freeTechnicianIds ?? []));
      },
      error: () => this.freeTechIds.set(null),
    });
  }

  private fillFrom(b: BookingDetail): void {
    this.customersApi.get(b.customerId).subscribe({
      next: (c) => {
        this.customer.set(c);
        this.customerPick = c;
      },
      error: () => {
        this.customerPick = { id: b.customerId, name: b.customerName, phone: b.customerPhone, createdAt: '' };
      },
    });
    this.addressId = b.addressId ?? null;
    this.start = new Date(b.scheduledStart);
    this.duration = Math.round((new Date(b.scheduledEnd).getTime() - this.start.getTime()) / 60000);
    this.durationTouched = true;
    this.notes = b.notes ?? '';
    this.internalNotes = b.internalNotes ?? '';
    this.paymentMethod = b.paymentMethod ?? null;
    const lines: Line[] = [];
    for (const it of b.items) {
      if (!it.addonId) {
        lines.push({ serviceId: it.serviceId, quantity: it.quantity, addonIds: [] });
      } else if (lines.length) {
        lines[lines.length - 1].addonIds.push(it.addonId);
      }
    }
    this.lines.set(lines.length ? lines : [{ serviceId: null, quantity: 1, addonIds: [] }]);
    this.refreshPreview();
  }
}
