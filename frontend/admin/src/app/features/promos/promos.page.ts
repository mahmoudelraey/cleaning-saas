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
  styles: `
    .code { display: inline-flex; align-items: center; gap: .4rem; font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
            font-weight: 700; letter-spacing: .04em; padding: .3rem .65rem; border-radius: 8px; border: 1px dashed var(--p-primary-300, #8fd3cc);
            background: var(--p-primary-50, #ebf8f7); color: var(--p-primary-700, #08524f); }
    .code button { border: 0; background: none; padding: 0; cursor: pointer; color: inherit; opacity: .7; }
    .code button:hover { opacity: 1; }
    .title-cell strong { display: block; }
    .announce { display: inline-flex; align-items: center; gap: .3rem; margin-top: .3rem; font-size: .75rem; font-weight: 600;
                color: var(--p-amber-700, #b45309); }
    .discount { font-weight: 700; font-size: 1.05rem; color: var(--p-primary-700, #08524f); }
    .sub { color: var(--fo-muted); font-size: .78rem; }
    .usage { min-width: 110px; }
    .bar { height: 6px; border-radius: 3px; background: var(--p-surface-200, #e2e8f0); overflow: hidden; margin-top: .35rem; }
    .bar span { display: block; height: 100%; background: var(--p-primary-500, #0b7a73); border-radius: 3px; }
    .hint { color: var(--fo-muted); font-size: .8rem; }
    .check { display: flex; align-items: center; gap: .5rem; }
    .check label { margin: 0; font-weight: 500; }
    h3 { margin: .75rem 0 .25rem; font-size: .95rem; }
    .preview { border-radius: 12px; padding: .7rem 1rem; display: flex; align-items: center; justify-content: center; gap: .6rem;
               flex-wrap: wrap; color: #fff; font-size: .85rem; background: linear-gradient(90deg, #0d5c46, #149b74); }
    .preview .pill { background: rgba(255, 255, 255, .2); padding: .1rem .55rem; border-radius: 999px; font-weight: 700; font-size: .75rem; }
    .preview code { background: rgba(0, 0, 0, .2); padding: .1rem .5rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, .25); }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'promos.title' | translate }}</h1>
        <p>{{ 'promos.subtitle' | translate }}</p>
      </div>
      @if (isOwner) {
        <p-button icon="pi pi-plus" [label]="'promos.new' | translate" (onClick)="open(null)" />
      }
    </div>

    <div class="panel-flush">
      <p-table [value]="promos()" [loading]="loading()" [rowHover]="true" dataKey="id" [paginator]="promos().length > 20" [rows]="20">
        <ng-template #header>
          <tr>
            <th>{{ 'promos.code' | translate }}</th>
            <th>{{ 'promos.titleCol' | translate }}</th>
            <th>{{ 'promos.discount' | translate }}</th>
            <th>{{ 'promos.validity' | translate }}</th>
            <th>{{ 'promos.usage' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
            @if (isOwner) {
              <th></th>
            }
          </tr>
        </ng-template>
        <ng-template #body let-p>
          <tr>
            <td>
              <span class="code ltr">
                {{ p.code }}
                <button type="button" (click)="copy(p.code)" [attr.aria-label]="'common.copy' | translate"><i class="pi pi-copy"></i></button>
              </span>
            </td>
            <td class="title-cell">
              <strong>{{ label(p.title, p.titleEn) }}</strong>
              @if (p.announce) {
                <span class="announce"><i class="pi pi-megaphone"></i>{{ 'promos.announced' | translate }}</span>
              }
            </td>
            <td>
              <div class="discount ltr">{{ p.discountType === 'PERCENT' ? p.discountValue + '%' : (p.discountValue | sar) }}</div>
              @if (p.discountType === 'PERCENT' && p.maxDiscountHalalas) {
                <div class="sub">{{ 'promos.upTo' | translate: { v: (p.maxDiscountHalalas | sar) } }}</div>
              }
              @if (p.minSubtotalHalalas) {
                <div class="sub">{{ 'promos.minOrder' | translate: { v: (p.minSubtotalHalalas | sar) } }}</div>
              }
            </td>
            <td>
              @if (p.startsAt || p.endsAt) {
                <div>{{ p.startsAt ? (p.startsAt | ldate: 'dayMonthYear') : '—' }} → {{ p.endsAt ? (p.endsAt | ldate: 'dayMonthYear') : ('promos.noEnd' | translate) }}</div>
              } @else {
                <span class="sub">{{ 'promos.always' | translate }}</span>
              }
              @if (p.firstBookingOnly) {
                <div class="sub"><i class="pi pi-user-plus"></i> {{ 'promos.firstOnly' | translate }}</div>
              }
            </td>
            <td class="usage">
              <span class="tnum">{{ p.usedCount }}@if (p.usageLimit) { / {{ p.usageLimit }} }</span>
              @if (p.usageLimit) {
                <div class="bar"><span [style.width.%]="usedPercent(p)"></span></div>
              }
            </td>
            <td>
              <p-tag [value]="'promos.state.' + state(p) | translate" [severity]="severity(p)" />
            </td>
            @if (isOwner) {
              <td class="row-actions">
                <p-button icon="pi pi-pencil" [text]="true" severity="secondary" (onClick)="open(p)" />
                <p-button icon="pi pi-trash" [text]="true" severity="danger" (onClick)="remove(p)" />
              </td>
            }
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="7"><div class="empty"><i class="pi pi-ticket"></i>{{ 'promos.empty' | translate }}</div></td>
          </tr>
        </ng-template>
      </p-table>
    </div>

    <p-dialog
      [header]="(editing() ? 'promos.edit' : 'promos.new') | translate"
      [(visible)]="dialogOpen"
      [modal]="true"
      [style]="{ width: '720px', maxWidth: '95vw' }"
      [draggable]="false"
    >
      <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
        <div class="field">
          <label for="p-code">{{ 'promos.code' | translate }}</label>
          <input pInputText id="p-code" dir="ltr" formControlName="code" placeholder="WELCOME20" (input)="upperCode()" maxlength="30" />
          <small class="hint">{{ 'promos.codeHint' | translate }}</small>
        </div>
        <div class="field">
          <label for="p-type">{{ 'promos.discountType' | translate }}</label>
          <p-selectbutton inputId="p-type" formControlName="discountType" [options]="typeOptions()" optionLabel="label" optionValue="value" [allowEmpty]="false" />
        </div>
        <div class="field">
          <label for="p-title">{{ 'promos.titleAr' | translate }}</label>
          <input pInputText id="p-title" dir="rtl" formControlName="title" maxlength="150" placeholder="خصم 20% على حجزك الأول" />
        </div>
        <div class="field">
          <label for="p-title-en">{{ 'promos.titleEn' | translate }}</label>
          <input pInputText id="p-title-en" dir="ltr" formControlName="titleEn" maxlength="150" placeholder="20% off your first booking" />
        </div>

        <div class="field">
          <label for="p-value">{{ (isPercent() ? 'promos.percent' : 'promos.amountSar') | translate }}</label>
          <p-inputnumber inputId="p-value" formControlName="value" mode="decimal" [min]="0" [max]="isPercent() ? 100 : 1000000"
                         [maxFractionDigits]="isPercent() ? 0 : 2" [suffix]="isPercent() ? '%' : ''" />
        </div>
        @if (isPercent()) {
          <div class="field">
            <label for="p-max">{{ 'promos.maxSar' | translate }}</label>
            <p-inputnumber inputId="p-max" formControlName="maxDiscount" mode="decimal" [min]="0" [maxFractionDigits]="2" [placeholder]="'promos.noLimit' | translate" />
          </div>
        } @else {
          <div></div>
        }
        <div class="field">
          <label for="p-min">{{ 'promos.minSar' | translate }}</label>
          <p-inputnumber inputId="p-min" formControlName="minSubtotal" mode="decimal" [min]="0" [maxFractionDigits]="2" [placeholder]="'promos.noMin' | translate" />
        </div>
        <div></div>

        <h3 class="full">{{ 'promos.when' | translate }}</h3>
        <div class="field">
          <label for="p-start">{{ 'promos.startsAt' | translate }}</label>
          <p-datepicker inputId="p-start" formControlName="startsAt" [showIcon]="true" [showClear]="true" dateFormat="yy-mm-dd" appendTo="body"
                        [placeholder]="'promos.fromNow' | translate" />
        </div>
        <div class="field">
          <label for="p-end">{{ 'promos.endsAt' | translate }}</label>
          <p-datepicker inputId="p-end" formControlName="endsAt" [showIcon]="true" [showClear]="true" dateFormat="yy-mm-dd" appendTo="body"
                        [minDate]="form.controls.startsAt.value ?? today" [placeholder]="'promos.noEnd' | translate" />
        </div>

        <h3 class="full">{{ 'promos.limits' | translate }}</h3>
        <div class="field">
          <label for="p-limit">{{ 'promos.usageLimit' | translate }}</label>
          <p-inputnumber inputId="p-limit" formControlName="usageLimit" [min]="1" [placeholder]="'promos.noLimit' | translate" />
        </div>
        <div class="field">
          <label for="p-per">{{ 'promos.perCustomer' | translate }}</label>
          <p-inputnumber inputId="p-per" formControlName="perCustomerLimit" [min]="1" [placeholder]="'promos.noLimit' | translate" />
        </div>
        <div class="check full">
          <p-checkbox inputId="p-first" formControlName="firstBookingOnly" [binary]="true" />
          <label for="p-first">{{ 'promos.firstOnlyLong' | translate }}</label>
        </div>

        <h3 class="full">{{ 'promos.visibility' | translate }}</h3>
        <div class="field">
          <label for="p-active">{{ 'common.active' | translate }}</label>
          <p-toggleswitch inputId="p-active" formControlName="active" />
        </div>
        <div class="field">
          <label for="p-announce">{{ 'promos.announce' | translate }}</label>
          <p-toggleswitch inputId="p-announce" formControlName="announce" />
          <small class="hint">{{ 'promos.announceHint' | translate }}</small>
        </div>
        @if (form.controls.announce.value) {
          <div class="full preview" aria-hidden="true">
            <span class="pill">{{ 'promos.previewTag' | translate }}</span>
            <span>{{ form.controls.title.value || ('promos.titleAr' | translate) }}</span>
            <code class="ltr">{{ form.controls.code.value || 'CODE' }}</code>
          </div>
        }

        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="dialogOpen.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [loading]="saving()" [disabled]="form.invalid" />
        </div>
      </form>
    </p-dialog>
  `,
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
