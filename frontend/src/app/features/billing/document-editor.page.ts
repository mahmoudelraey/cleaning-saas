import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { AutoComplete, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { Textarea } from 'primeng/textarea';

import { CustomerSummary, LineInput, Quote, ServiceOffering } from '../../core/api.types';
import { errorMessage } from '../../core/http/api-error';
import { TenantService } from '../../core/tenant.service';
import { PhonePipe, SarPipe, toHalalas, toSar } from '../../shared/format';
import { CustomersApi } from '../customers/customers.api';
import { BillingApi } from './billing.api';

interface EditorLine {
  mode: 'service' | 'custom';
  serviceId: string | null;
  addonIds: string[];
  description: string;
  quantity: number | null;
  unitPrice: number | null; // SAR, custom lines only
}

const VAT_BP = 1500;

/** New invoice, new quote or edit quote. Invoices cannot be edited once issued (gap-free, legal record). */
@Component({
  selector: 'app-document-editor',
  imports: [
    FormsModule, RouterLink, TranslatePipe, AutoComplete, Button, Checkbox, DatePicker, InputNumber, InputText, Select,
    SelectButton, Textarea, PhonePipe, SarPipe,
  ],
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
    h2 { font-size: 1.05rem; margin: 0 0 1rem; }
    .panel + .panel { margin-top: 1rem; }
    .line { border: 1px solid var(--fo-border); border-radius: 10px; padding: .875rem; display: grid; gap: .75rem; }
    .line + .line { margin-top: .75rem; }
    .line-top { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }
    .line-grid { display: grid; grid-template-columns: minmax(0, 1fr) 120px 140px; gap: .5rem; align-items: end; }
    .line-grid.service { grid-template-columns: minmax(0, 1fr) 120px; }
    @media (max-width: 640px) { .line-grid, .line-grid.service { grid-template-columns: 1fr 1fr; } .line-grid .grow { grid-column: 1 / -1; } }
    .addons { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; }
    .addons label { display: inline-flex; gap: .4rem; align-items: center; cursor: pointer; }
    .line-total { text-align: end; color: var(--fo-muted); font-size: .9rem; }
    .summary-row { display: flex; justify-content: space-between; gap: 1rem; padding: .35rem 0; }
    .summary-row.total { border-top: 1px solid var(--fo-border); margin-top: .5rem; padding-top: .75rem; font-weight: 700; font-size: 1.1rem; }
    .sticky { position: sticky; top: 76px; }
    .back { color: var(--fo-muted); text-decoration: none; display: inline-flex; gap: .35rem; align-items: center; margin-block-end: .75rem; }
    .cust-option small { color: var(--fo-muted); margin-inline-start: .5rem; }
    .check { display: inline-flex; gap: .5rem; align-items: center; cursor: pointer; margin-top: .75rem; }
  `,
  template: `
    <a [routerLink]="backLink()" class="back"><i class="pi pi-arrow-right rtl-flip"></i>{{ (kind() === 'invoice' ? 'invoices.title' : 'quotes.title') | translate }}</a>
    <div class="page-header">
      <div>
        <h1>{{ titleKey() | translate }}</h1>
        @if (kind() === 'invoice') { <p>{{ 'invoices.issueHint' | translate }}</p> }
      </div>
    </div>

    <div class="layout">
      <div>
        <div class="panel">
          <h2>{{ 'bookings.customer' | translate }}</h2>
          <div class="form-grid">
            <div class="field full">
              <label for="d-cust">{{ 'bookings.customer' | translate }}</label>
              <p-autocomplete inputId="d-cust" [(ngModel)]="customerPick" [suggestions]="customerSuggestions()"
                              (completeMethod)="searchCustomers($event)" (onSelect)="customer.set($event.value)"
                              optionLabel="name" [forceSelection]="true" [placeholder]="'bookings.customerSearch' | translate" [fluid]="true">
                <ng-template #item let-c>
                  <span class="cust-option">{{ c.name }}<small class="ltr">{{ c.phone | phone }}</small></span>
                </ng-template>
              </p-autocomplete>
            </div>
            @if (kind() === 'invoice') {
              <div class="field">
                <label for="d-cvat">{{ 'invoices.customerVat' | translate }}</label>
                <input pInputText id="d-cvat" [(ngModel)]="customerVat" dir="ltr" placeholder="3XXXXXXXXXXXXX3" maxlength="15" />
                <small class="hint">{{ 'invoices.customerVatHint' | translate }}</small>
              </div>
            }
          </div>
        </div>

        <div class="panel">
          <h2>{{ 'doc.lines' | translate }}</h2>
          @for (line of lines(); track $index; let i = $index) {
            <div class="line">
              <div class="line-top">
                <p-selectbutton [options]="modes()" [(ngModel)]="line.mode" (onChange)="touch()" optionLabel="label" optionValue="value" [allowEmpty]="false" size="small" />
                <p-button icon="pi pi-trash" [text]="true" severity="danger" (onClick)="removeLine(i)" [disabled]="lines().length === 1" />
              </div>
              @if (line.mode === 'service') {
                <div class="line-grid service">
                  <div class="field grow">
                    <label>{{ 'bookings.service' | translate }}</label>
                    <p-select [options]="services()" [(ngModel)]="line.serviceId" (onChange)="line.addonIds = []; touch()" optionLabel="name" optionValue="id"
                              [placeholder]="'bookings.chooseService' | translate" [filter]="true" filterBy="name" [fluid]="true" appendTo="body" />
                  </div>
                  <div class="field">
                    <label>{{ 'bookings.qty' | translate }}</label>
                    <p-inputnumber [(ngModel)]="line.quantity" (onInput)="touch()" [min]="0" [maxFractionDigits]="2" [useGrouping]="false" [fluid]="true" />
                  </div>
                </div>
                @if (serviceOf(line); as s) {
                  @if (activeAddons(s).length) {
                    <div class="addons">
                      @for (a of activeAddons(s); track a.id) {
                        <label><p-checkbox [value]="a.id" [(ngModel)]="line.addonIds" (onChange)="touch()" /> {{ a.name }} <span class="muted ltr">+{{ a.priceHalalas | sar }}</span></label>
                      }
                    </div>
                  }
                }
              } @else {
                <div class="line-grid">
                  <div class="field grow">
                    <label>{{ 'doc.description' | translate }}</label>
                    <input pInputText [(ngModel)]="line.description" (input)="touch()" maxlength="300" />
                  </div>
                  <div class="field">
                    <label>{{ 'bookings.qty' | translate }}</label>
                    <p-inputnumber [(ngModel)]="line.quantity" (onInput)="touch()" [min]="0" [maxFractionDigits]="2" [useGrouping]="false" [fluid]="true" />
                  </div>
                  <div class="field">
                    <label>{{ 'doc.unitPriceSar' | translate }}</label>
                    <p-inputnumber [(ngModel)]="line.unitPrice" (onInput)="touch()" [min]="0" [maxFractionDigits]="2" [fluid]="true" />
                  </div>
                </div>
              }
              <div class="line-total ltr">{{ lineTotal(line) | sar }}</div>
            </div>
          }
          <p-button icon="pi pi-plus" [text]="true" size="small" [label]="'doc.addLine' | translate" (onClick)="addLine()" />
        </div>

        <div class="panel">
          <h2>{{ 'doc.details' | translate }}</h2>
          <div class="form-grid">
            <div class="field">
              <label for="d-date">{{ (kind() === 'invoice' ? 'doc.dueDate' : 'doc.validUntil') | translate }}</label>
              <p-datepicker inputId="d-date" [(ngModel)]="date" [minDate]="today" dateFormat="yy-mm-dd" [showIcon]="true" [showClear]="kind() === 'invoice'" [fluid]="true" />
            </div>
            <div class="field">
              <label for="d-disc">{{ 'doc.discountSar' | translate }}</label>
              <p-inputnumber inputId="d-disc" [(ngModel)]="discount" (onInput)="touch()" [min]="0" [maxFractionDigits]="2" [fluid]="true" />
            </div>
            <div class="field full">
              <label for="d-notes">{{ 'doc.notes' | translate }}</label>
              <textarea pTextarea id="d-notes" [(ngModel)]="notes" rows="3" maxlength="2000" [placeholder]="'doc.notesPlaceholder' | translate"></textarea>
            </div>
          </div>
        </div>
      </div>

      <div class="sticky">
        <div class="panel">
          <h2>{{ 'doc.summary' | translate }}</h2>
          @let t = totals();
          <div class="summary-row"><span>{{ 'doc.subtotal' | translate }}</span><span class="ltr">{{ t.lines | sar }}</span></div>
          @if (t.discount) { <div class="summary-row"><span>{{ 'doc.discount' | translate }}</span><span class="ltr">{{ -t.discount | sar }}</span></div> }
          @if (vatRegistered()) {
            <div class="summary-row"><span>{{ 'doc.taxable' | translate }}</span><span class="ltr">{{ t.taxable | sar }}</span></div>
            <div class="summary-row"><span>{{ 'doc.vat' | translate: { rate: 15 } }}</span><span class="ltr">{{ t.vat | sar }}</span></div>
          }
          <div class="summary-row total"><span>{{ 'doc.total' | translate }}</span><span class="ltr">{{ t.total | sar }}</span></div>
          <small class="hint">{{ (vatRegistered() ? (includeVat() ? 'invoices.vatInclusive' : 'invoices.vatExclusive') : 'invoices.noVatHint') | translate }}</small>

          @if (kind() === 'invoice') {
            <label class="check"><p-checkbox [(ngModel)]="sendAfter" [binary]="true" /> {{ 'invoices.sendAfter' | translate }}</label>
          }
          <div class="dialog-actions">
            <p-button [label]="submitKey() | translate" icon="pi pi-check" [loading]="saving()" [disabled]="!canSubmit()" (onClick)="submit()" />
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DocumentEditorPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = inject(BillingApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly tenants = inject(TenantService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  /** Route data: 'invoice' | 'quote'. */
  readonly kind = input<'invoice' | 'quote'>('invoice');
  /** Quote id when editing (route param). */
  readonly id = input<string>();
  /** Pre-selected customer (?customerId=). */
  readonly customerId = input<string>();

  protected readonly services = signal<ServiceOffering[]>([]);
  protected readonly lines = signal<EditorLine[]>([newLine()]);
  protected readonly customer = signal<CustomerSummary | null>(null);
  protected readonly customerSuggestions = signal<CustomerSummary[]>([]);
  protected readonly saving = signal(false);
  private readonly version = signal(0);
  protected customerPick: CustomerSummary | null = null;
  protected customerVat = '';
  protected discount: number | null = null;
  protected notes = '';
  protected date: Date | null = null;
  protected sendAfter = true;
  protected readonly today = new Date();
  private bookingId: string | null = null;

  protected readonly vatRegistered = computed(() => !!this.tenants.tenant()?.vatNumber);
  protected readonly includeVat = computed(() => !!this.tenants.tenant()?.pricesIncludeVat);
  protected readonly titleKey = computed(() =>
    this.kind() === 'invoice' ? 'invoices.new' : this.id() ? 'quotes.edit' : 'quotes.new',
  );
  protected readonly submitKey = computed(() =>
    this.kind() === 'invoice' ? 'invoices.issue' : this.id() ? 'common.save' : 'quotes.create',
  );
  protected readonly backLink = computed(() =>
    this.kind() === 'invoice' ? ['/invoices'] : this.id() ? ['/quotes', this.id()] : ['/quotes'],
  );
  protected readonly modes = computed(() => [
    { value: 'service', label: this.translate.instant('doc.fromCatalog') },
    { value: 'custom', label: this.translate.instant('doc.customLine') },
  ]);

  /** Client-side preview mirroring the server's VAT maths (the server result is what counts). */
  protected readonly totals = computed(() => {
    this.version();
    const lines = this.lines().reduce((sum, l) => sum + this.lineTotal(l), 0);
    const discount = Math.min(toHalalas(this.discount), lines);
    const after = lines - discount;
    if (!this.vatRegistered()) {
      return { lines, discount, taxable: after, vat: 0, total: after };
    }
    if (this.includeVat()) {
      const taxable = Math.round((after * 10000) / (10000 + VAT_BP));
      return { lines, discount, taxable, vat: after - taxable, total: after };
    }
    const vat = Math.round((after * VAT_BP) / 10000);
    return { lines, discount, taxable: after, vat, total: after + vat };
  });

  protected readonly canSubmit = computed(() => {
    this.version();
    return !!this.customer() && this.lines().length > 0 && this.lines().every((l) => this.isValid(l));
  });

  ngOnInit(): void {
    this.tenants.load().subscribe({ error: () => {} });
    this.http.get<ServiceOffering[]>('/api/v1/services', { params: { activeOnly: true } }).subscribe((s) => this.services.set(s));
    if (this.kind() === 'quote' && !this.id()) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      this.date = d;
    }
    const id = this.id();
    if (id) {
      this.api.quote(id).subscribe((q) => this.fillFrom(q));
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

  serviceOf(line: EditorLine): ServiceOffering | undefined {
    return this.services().find((s) => s.id === line.serviceId);
  }

  activeAddons(s: ServiceOffering) {
    return s.addons.filter((a) => a.active);
  }

  lineTotal(l: EditorLine): number {
    const qty = l.quantity ?? (l.mode === 'service' ? 1 : 0);
    if (l.mode === 'custom') {
      return Math.round(qty * toHalalas(l.unitPrice));
    }
    const s = this.serviceOf(l);
    if (!s) return 0;
    const addons = s.addons.filter((a) => l.addonIds.includes(a.id)).reduce((sum, a) => sum + a.priceHalalas, 0);
    return Math.round(qty * s.basePriceHalalas) + addons;
  }

  addLine(): void {
    this.lines.update((ls) => [...ls, newLine()]);
  }

  removeLine(i: number): void {
    this.lines.update((ls) => ls.filter((_, idx) => idx !== i));
  }

  touch(): void {
    this.version.update((v) => v + 1);
  }

  submit(): void {
    const c = this.customer();
    if (!c) return;
    const lines: LineInput[] = this.lines().map((l) =>
      l.mode === 'service'
        ? { serviceId: l.serviceId!, quantity: l.quantity ?? undefined, addonIds: l.addonIds }
        : { description: l.description.trim(), quantity: l.quantity ?? 1, unitPriceHalalas: toHalalas(l.unitPrice) },
    );
    const date = this.date ? isoDate(this.date) : null;
    this.saving.set(true);
    const done = (path: unknown[]) => {
      this.saving.set(false);
      void this.router.navigate(path);
    };
    const fail = (e: unknown) => {
      this.saving.set(false);
      this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
    };

    if (this.kind() === 'invoice') {
      this.api
        .issue({
          customerId: c.id,
          lines,
          discountHalalas: toHalalas(this.discount),
          dueDate: date,
          notes: this.notes.trim() || null,
          customerVatNumber: this.customerVat.trim() || null,
          send: this.sendAfter,
        })
        .subscribe({ next: (inv) => done(['/invoices', inv.id]), error: fail });
      return;
    }
    const body = {
      customerId: c.id,
      bookingId: this.bookingId,
      lines,
      discountHalalas: toHalalas(this.discount),
      validUntil: date,
      notes: this.notes.trim() || null,
    };
    const id = this.id();
    (id ? this.api.updateQuote(id, body) : this.api.createQuote(body)).subscribe({
      next: (q) => done(['/quotes', q.id]),
      error: fail,
    });
  }

  private isValid(l: EditorLine): boolean {
    if (l.mode === 'service') {
      return !!l.serviceId && (l.quantity === null || l.quantity > 0);
    }
    return !!l.description.trim() && (l.quantity ?? 0) > 0 && l.unitPrice !== null && l.unitPrice >= 0;
  }

  /** Editing keeps the stored lines as custom lines (their prices were frozen when the quote was made). */
  private fillFrom(q: Quote): void {
    this.customer.set({ id: q.customerId, name: q.customerName, phone: q.customerPhone, createdAt: q.createdAt });
    this.customerPick = this.customer();
    this.bookingId = q.bookingId ?? null;
    this.lines.set(
      q.lines.map((l) => ({
        mode: 'custom' as const,
        serviceId: null,
        addonIds: [],
        description: l.description,
        quantity: l.quantity,
        unitPrice: toSar(l.unitPriceHalalas),
      })),
    );
    this.discount = q.discountHalalas ? toSar(q.discountHalalas) : null;
    this.notes = q.notes ?? '';
    this.date = new Date(q.validUntil + 'T12:00:00');
    this.touch();
  }
}

function newLine(): EditorLine {
  return { mode: 'service', serviceId: null, addonIds: [], description: '', quantity: null, unitPrice: null };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
