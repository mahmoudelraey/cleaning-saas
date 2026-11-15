import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
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
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TableModule,
    Button,
    Checkbox,
    DatePicker,
    Dialog,
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
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
