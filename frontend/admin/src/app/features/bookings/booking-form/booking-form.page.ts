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
} from '../../../core/api.types';
import { LanguageService } from '../../../core/i18n/language.service';
import { errorMessage } from '../../../core/http/api-error';
import { PhonePipe, SarPipe } from '../../../shared/format';
import { CustomersApi } from '../../customers/customers.api';
import { BookingsApi } from '../bookings.api';
import { doesAnyService } from '../../../shared/technician-services';

interface Line {
  serviceId: string | null;
  /** The chosen option (small / medium / large car …) when the service has options. */
  optionId: string | null;
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
  styleUrl: './booking-form.page.scss',
  templateUrl: './booking-form.page.html',
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
  protected readonly lines = signal<Line[]>([{ serviceId: null, optionId: null, quantity: 1, addonIds: [] }]);
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
  /** Formats option prices in the option list (created here so it can inject the language). */
  private readonly sar = new SarPipe();

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

  /** Active options in their order, labelled "name — price" in the admin's language. */
  optionChoices(s: ServiceOffering) {
    const sar = this.sar;
    return (s.options ?? [])
      .filter((o) => o.active)
      .map((o) => ({
        value: o.id,
        label: `${(this.lang.current() === 'en' && o.nameEn?.trim()) || o.name} — ${sar.transform(o.priceHalalas)}`,
      }));
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
    const s = this.serviceOf(line);
    const choices = s ? this.optionChoices(s) : [];
    // A single option is chosen for the coordinator; with several they pick one.
    line.optionId = choices.length === 1 ? choices[0].value : null;
    line.quantity = this.isFixed(line) ? 1 : null;
    this.lines.set([...this.lines()]);
    this.refreshPreview();
  }

  addLine(): void {
    this.lines.set([...this.lines(), { serviceId: null, optionId: null, quantity: 1, addonIds: [] }]);
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
    return !!this.customer() && !!this.start && !!this.preview() && !this.missingOption() && !this.saving();
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

  /** A line without its required option is left out of the price (the summary asks for it instead). */
  needsOption(line: Line): boolean {
    const s = this.serviceOf(line);
    return !!s && !line.optionId && this.optionChoices(s).length > 0;
  }

  protected readonly missingOption = computed(() => this.lines().some((l) => this.needsOption(l)));

  private validLines() {
    return this.lines()
      .filter((l) => !!l.serviceId && !this.needsOption(l))
      .map((l) => ({ serviceId: l.serviceId!, optionId: l.optionId, quantity: l.quantity, addonIds: l.addonIds }));
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
        lines.push({ serviceId: it.serviceId, optionId: it.optionId ?? null, quantity: it.quantity, addonIds: [] });
      } else if (lines.length) {
        lines[lines.length - 1].addonIds.push(it.addonId);
      }
    }
    this.lines.set(lines.length ? lines : [{ serviceId: null, optionId: null, quantity: 1, addonIds: [] }]);
    this.refreshPreview();
  }
}
