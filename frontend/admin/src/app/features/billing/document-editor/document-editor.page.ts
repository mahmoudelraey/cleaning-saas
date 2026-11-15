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

import { CustomerSummary, LineInput, Quote, ServiceOffering } from '../../../core/api.types';
import { errorMessage } from '../../../core/http/api-error';
import { TenantService } from '../../../core/tenant.service';
import { PhonePipe, SarPipe, toHalalas, toSar } from '../../../shared/format';
import { CustomersApi } from '../../customers/customers.api';
import { BillingApi } from '../billing.api';

interface EditorLine {
  mode: 'service' | 'custom';
  serviceId: string | null;
  /** Chosen option when the service has options (required then). */
  optionId: string | null;
  addonIds: string[];
  description: string;
  quantity: number | null;
  unitPrice: number | null; // SAR, custom lines only
  /** Custom line from an existing quote: the catalog service / add-on it was priced from (kept on save). */
  fromServiceId?: string;
  fromAddonId?: string;
  fromOptionId?: string;
}

const VAT_BP = 1500;

/** New invoice, new quote or edit quote. Invoices cannot be edited once issued (gap-free, legal record). */
@Component({
  selector: 'app-document-editor',
  imports: [
    FormsModule, RouterLink, TranslatePipe, AutoComplete, Button, Checkbox, DatePicker, InputNumber, InputText, Select,
    SelectButton, Textarea, PhonePipe, SarPipe,
  ],
  styleUrl: './document-editor.page.scss',
  templateUrl: './document-editor.page.html',
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

  activeOptions(s: ServiceOffering) {
    return (s.options ?? []).filter((o) => o.active);
  }

  /** New service on a line: options and add-ons reset; a single option is picked automatically. */
  onServiceChange(line: EditorLine): void {
    line.addonIds = [];
    const s = this.serviceOf(line);
    const options = s ? this.activeOptions(s) : [];
    line.optionId = options.length === 1 ? options[0].id : null;
    this.touch();
  }

  lineTotal(l: EditorLine): number {
    const qty = l.quantity ?? (l.mode === 'service' ? 1 : 0);
    if (l.mode === 'custom') {
      return Math.round(qty * toHalalas(l.unitPrice));
    }
    const s = this.serviceOf(l);
    if (!s) return 0;
    const addons = s.addons.filter((a) => l.addonIds.includes(a.id)).reduce((sum, a) => sum + a.priceHalalas, 0);
    const option = this.activeOptions(s).find((o) => o.id === l.optionId);
    return Math.round(qty * (option?.priceHalalas ?? s.basePriceHalalas)) + addons;
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
        ? { serviceId: l.serviceId!, optionId: l.optionId, quantity: l.quantity ?? undefined, addonIds: l.addonIds }
        : {
            description: l.description.trim(),
            quantity: l.quantity ?? 1,
            unitPriceHalalas: toHalalas(l.unitPrice),
            catalogServiceId: l.fromServiceId,
            catalogAddonId: l.fromAddonId,
            catalogOptionId: l.fromOptionId,
          },
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
      const s = this.serviceOf(l);
      const needsOption = !!s && this.activeOptions(s).length > 0 && !l.optionId;
      return !!l.serviceId && !needsOption && (l.quantity === null || l.quantity > 0);
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
        optionId: null,
        addonIds: [],
        description: l.description,
        quantity: l.quantity,
        unitPrice: toSar(l.unitPriceHalalas),
        fromServiceId: l.serviceId,
        fromAddonId: l.addonId,
        fromOptionId: l.optionId,
      })),
    );
    this.discount = q.discountHalalas ? toSar(q.discountHalalas) : null;
    this.notes = q.notes ?? '';
    this.date = new Date(q.validUntil + 'T12:00:00');
    this.touch();
  }
}

function newLine(): EditorLine {
  return { mode: 'service', serviceId: null, optionId: null, addonIds: [], description: '', quantity: null, unitPrice: null };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
