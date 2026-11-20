import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { Select } from 'primeng/select';
import { Checkbox } from 'primeng/checkbox';
import { DatePicker } from 'primeng/datepicker';
import { AppDialog } from '../../shared/dialog/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { DiscountType, Promo } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { SarPipe, toHalalas, toSar } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { DetailField, DetailsDialog } from '../../shared/details-dialog/details-dialog';
import { CreatedBy } from '../../shared/details-dialog/audit-block';

const BASE = '/api/v1/promos';

/** Where a promo stands today. */
export type PromoState = 'LIVE' | 'SCHEDULED' | 'EXPIRED' | 'USED_UP' | 'OFF';

export function promoState(p: Promo, now = new Date()): PromoState {
  if (!p.active) return 'OFF';
  if (p.endsAt && new Date(p.endsAt) <= now) return 'EXPIRED';
  if (p.usageLimit && p.usedCount >= p.usageLimit) return 'USED_UP';
  if (p.startsAt && new Date(p.startsAt) > now) return 'SCHEDULED';
  return 'LIVE';
}

const STATE_SEVERITY: Record<PromoState, 'success' | 'info' | 'secondary' | 'warn' | 'danger'> = {
  LIVE: 'success',
  SCHEDULED: 'info',
  EXPIRED: 'secondary',
  USED_UP: 'warn',
  OFF: 'secondary',
};

/**
 * Promotions: discount codes customers type while booking in the portal. One of them can also be announced as
 * a bar on the company's public page.
 */
@Component({
  selector: 'app-promos',
  imports: [DetailsDialog, CreatedBy, FormsModule, IconField, InputIcon, Select,
    ReactiveFormsModule,
    TranslatePipe,
    TableModule,
    Button,
    Checkbox,
    DatePicker,
    AppDialog,
    InputNumber,
    InputText,
    SelectButton,
    Tag,
    ToggleSwitch,
    SarPipe,
    LocalDatePipe,
  ],
  styleUrl: './promos.page.scss',
  templateUrl: './promos.page.html',
})
export class PromosPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);
  protected readonly isOwner = inject(AuthService).hasRole('OWNER');

  protected readonly promos = signal<Promo[]>([]);

  /** Search by discount code (or title) and filter by status; the list is small, so it filters in the page. */
  protected readonly query = signal('');
  protected readonly stateFilter = signal<PromoState | null>(null);
  protected readonly stateOptions = computed(() => {
    this.lang.current(); // relabel when the language changes
    return (['LIVE', 'SCHEDULED', 'EXPIRED', 'USED_UP', 'OFF'] as PromoState[]).map((s) => ({
      value: s,
      label: this.translate.instant('promos.state.' + s),
    }));
  });
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const st = this.stateFilter();
    return this.promos().filter(
      (p) =>
        (!st || promoState(p) === st) &&
        (!q ||
          p.code.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          (p.titleEn ?? '').toLowerCase().includes(q)),
    );
  });
  protected readonly filtering = computed(() => !!this.query().trim() || !!this.stateFilter());
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<Promo | null>(null);
  protected readonly today = new Date();

  protected readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Z0-9-]{3,30}$/)]],
    title: ['', [Validators.required, Validators.maxLength(150)]],
    titleEn: ['', [Validators.maxLength(150)]],
    discountType: ['PERCENT' as DiscountType, Validators.required],
    value: [10 as number | null, [Validators.required, Validators.min(0.01)]],
    maxDiscount: [null as number | null],
    minSubtotal: [null as number | null],
    startsAt: [null as Date | null],
    endsAt: [null as Date | null],
    usageLimit: [null as number | null],
    perCustomerLimit: [1 as number | null],
    firstBookingOnly: [false],
    active: [true],
    announce: [false],
  });

  private readonly type = signal<DiscountType>('PERCENT');
  protected readonly isPercent = computed(() => this.type() === 'PERCENT');

  protected readonly typeOptions = () =>
    (['PERCENT', 'AMOUNT'] as DiscountType[]).map((v) => ({ value: v, label: this.translate.instant('promos.types.' + v) }));

  constructor() {
    this.form.controls.discountType.valueChanges.subscribe((t) => this.type.set(t ?? 'PERCENT'));
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.http.get<Promo[]>(BASE).subscribe({
      next: (p) => {
        this.promos.set(p);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(p: Promo | null): void {
    this.editing.set(p);
    this.form.reset({
      code: p?.code ?? '',
      title: p?.title ?? '',
      titleEn: p?.titleEn ?? '',
      discountType: p?.discountType ?? 'PERCENT',
      value: p ? (p.discountType === 'PERCENT' ? p.discountValue : toSar(p.discountValue)) : 10,
      maxDiscount: p?.maxDiscountHalalas ? toSar(p.maxDiscountHalalas) : null,
      minSubtotal: p?.minSubtotalHalalas ? toSar(p.minSubtotalHalalas) : null,
      startsAt: p?.startsAt ? new Date(p.startsAt) : null,
      // Stored as the moment it stops (midnight after the last day); the picker shows the last day.
      endsAt: p?.endsAt ? new Date(new Date(p.endsAt).getTime() - 1) : null,
      usageLimit: p?.usageLimit ?? null,
      perCustomerLimit: p ? (p.perCustomerLimit ?? null) : 1,
      firstBookingOnly: p?.firstBookingOnly ?? false,
      active: p?.active ?? true,
      announce: p?.announce ?? false,
    });
    this.type.set(this.form.controls.discountType.value ?? 'PERCENT');
    this.dialogOpen.set(true);
  }

  protected upperCode(): void {
    const c = this.form.controls.code;
    const v = (c.value ?? '').toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
    if (v !== c.value) c.setValue(v);
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const percent = v.discountType === 'PERCENT';
    const body = {
      code: v.code,
      title: v.title?.trim(),
      titleEn: v.titleEn?.trim() || null,
      discountType: v.discountType,
      discountValue: percent ? Math.round(v.value ?? 0) : toHalalas(v.value),
      maxDiscountHalalas: percent && v.maxDiscount ? toHalalas(v.maxDiscount) : null,
      minSubtotalHalalas: v.minSubtotal ? toHalalas(v.minSubtotal) : 0,
      // Whole days in the browser's (company's) time zone: from the start of the first day to the end of the last.
      startsAt: v.startsAt ? startOfDay(v.startsAt).toISOString() : null,
      endsAt: v.endsAt ? startOfDay(addDays(v.endsAt, 1)).toISOString() : null,
      usageLimit: v.usageLimit || null,
      perCustomerLimit: v.perCustomerLimit || null,
      firstBookingOnly: !!v.firstBookingOnly,
      active: !!v.active,
      announce: !!v.announce,
    };
    const existing = this.editing();
    this.saving.set(true);
    const req$ = existing ? this.http.put<Promo>(`${BASE}/${existing.id}`, body) : this.http.post<Promo>(BASE, body);
    req$.subscribe({ next: () => this.done(), error: (e) => this.fail(e) });
  }

  remove(p: Promo): void {
    this.confirm.confirm({
      message: this.translate.instant(p.usedCount ? 'promos.confirmDeleteUsed' : 'promos.confirmDelete', { code: p.code }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.http.delete(`${BASE}/${p.id}`).subscribe({ next: () => this.done(), error: (e) => this.fail(e) }),
    });
  }

  protected copy(code: string): void {
    void navigator.clipboard?.writeText(code);
    this.messages.add({ severity: 'success', summary: this.translate.instant('common.copied') });
  }

  protected state(p: Promo): PromoState {
    return promoState(p);
  }

  protected severity(p: Promo) {
    return STATE_SEVERITY[promoState(p)];
  }

  protected usedPercent(p: Promo): number {
    return p.usageLimit ? Math.min(100, (p.usedCount / p.usageLimit) * 100) : 0;
  }

  protected label(ar: string, en?: string | null): string {
    return (this.lang.current() === 'en' && en?.trim()) || ar;
  }

  private done(): void {
    this.saving.set(false);
    this.dialogOpen.set(false);
    this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
    this.reload();
  }

  private fail(err: unknown): void {
    this.saving.set(false);
    this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
  }
  /** Read-only details with who created / last changed the record (eye button in the table). */
  protected readonly viewing = signal<Promo | null>(null);
  protected readonly viewOpen = signal(false);

  protected view(item: Promo, event?: Event): void {
    event?.stopPropagation();
    this.viewing.set(item);
    this.viewOpen.set(true);
  }

  protected viewFields(x: Promo): DetailField[] {
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    const sar = (h: number) => (h / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' SAR';
    return [
      { label: 'promos.code', value: x.code, kind: 'ltr' },
      { label: 'common.status', value: t('promos.state.' + this.state(x)), kind: 'status', on: this.severity(x) === 'success' },
      { label: 'promos.titleCol', value: x.title },
      { label: 'promos.titleEn', value: x.titleEn ?? null, kind: 'ltr' },
      { label: 'promos.discount', value: x.discountType === 'PERCENT' ? x.discountValue + '%' : sar(x.discountValue), kind: 'ltr' },
      { label: 'promos.minOrder', value: x.minSubtotalHalalas ? sar(x.minSubtotalHalalas) : null, kind: 'ltr' },
      { label: 'promos.startsAt', value: x.startsAt ?? null, kind: 'date' },
      { label: 'promos.endsAt', value: x.endsAt ?? t('promos.noEnd'), kind: x.endsAt ? 'date' : 'text' },
      { label: 'promos.usage', value: x.usageLimit ? x.usedCount + ' / ' + x.usageLimit : '' + x.usedCount, kind: 'ltr' },
      { label: 'promos.firstOnly', value: t(x.firstBookingOnly ? 'common.yes' : 'common.no') },
      { label: 'promos.announced', value: t(x.announce ? 'common.yes' : 'common.no') },
    ];
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

}
