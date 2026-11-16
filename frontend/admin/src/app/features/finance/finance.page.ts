import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { DatePicker } from 'primeng/datepicker';
import { AppDialog } from '../../shared/dialog/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { Tab, TabList, Tabs } from 'primeng/tabs';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';

import { ServiceOffering } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { SarPipe, toHalalas, toSar } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { growth, isoDate } from '../analytics/analytics.api';
import { MUTED, NEGATIVE, OTHER_COLOR, PALETTE, POSITIVE, alpha, baseOptions, monthName, moneyAxis, moneyTooltip, pctText, sarCurrency } from '../analytics/charts';
import { loader } from '../analytics/load';
import { KpiCard, StateBlock } from '../analytics/widgets/widgets';
import { EXPENSE_CATEGORIES, Expense, ExpenseCategory, ExpenseInput, FinanceApi, ExpenseList } from './finance.api';
import { DetailField, DetailsDialog } from '../../shared/details-dialog/details-dialog';
import { CreatedBy } from '../../shared/details-dialog/audit-block';

type TabKey = 'pnl' | 'expenses';
const PAGE = 25;

/**
 * Financial management: profit and loss by month against the previous year (owner only, it includes salaries)
 * and the operating-expenses ledger (owner, or coordinators given the Expenses screen).
 */
@Component({
  selector: 'app-finance',
  imports: [DetailsDialog, CreatedBy,
    FormsModule, ReactiveFormsModule, TranslatePipe, UIChart, Tabs, TabList, Tab, Button, AppDialog, InputNumber, InputText, Select,
    DatePicker, TableModule, Tag, Tooltip, SarPipe, LocalDatePipe, KpiCard, StateBlock,
  ],
  styleUrl: './finance.page.scss',
  templateUrl: './finance.page.html',
})
export class FinancePage {
  private readonly api = inject(FinanceApi);
  private readonly http = inject(HttpClient);
  private readonly lang = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  protected readonly isOwner = inject(AuthService).hasRole('OWNER');
  protected readonly tab = signal<TabKey>(this.isOwner ? 'pnl' : 'expenses');
  protected readonly thisYear = new Date().getFullYear();
  protected readonly year = signal(this.thisYear);
  protected readonly today = new Date();
  protected readonly rtl = computed(() => this.lang.current() === 'ar');
  protected readonly pageSize = PAGE;

  protected readonly summary = loader(computed(() => (this.isOwner ? this.year() : null)), (y) => this.api.summary(y));

  private readonly services = toSignal(this.http.get<ServiceOffering[]>('/api/v1/services'), { initialValue: [] as ServiceOffering[] });

  // ---- expenses ledger

  protected expRange: Date[] | null = [new Date(this.today.getFullYear(), this.today.getMonth(), 1), new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0)];
  protected readonly expCategory = signal<ExpenseCategory | null>(null);
  protected readonly expenses = signal<ExpenseList | null>(null);
  protected readonly expLoading = signal(false);
  protected readonly expFirst = signal(0);

  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<Expense | null>(null);
  protected readonly saving = signal(false);
  protected readonly form = this.fb.group({
    category: this.fb.nonNullable.control<ExpenseCategory>('SUPPLIES', Validators.required),
    spentOn: this.fb.control<Date | null>(new Date(), Validators.required),
    description: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(300)]),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    vat: this.fb.control<number | null>(0, [Validators.min(0)]),
    vendor: this.fb.nonNullable.control(''),
    reference: this.fb.nonNullable.control(''),
    serviceId: this.fb.control<string | null>(null),
  });

  protected readonly categoryOptions = computed(() => {
    this.lang.current();
    return EXPENSE_CATEGORIES.map((c) => ({ value: c, label: this.translate.instant('expenseCategory.' + c) }));
  });
  protected readonly serviceOptions = computed(() =>
    this.services().map((s) => ({ value: s.id, label: (this.lang.current() === 'en' && s.nameEn) || s.name })),
  );

  protected svcName(id: string): string {
    return this.serviceOptions().find((o) => o.value === id)?.label ?? '';
  }

  protected onExpRange(): void {
    if (this.expRange?.[0] && this.expRange[1]) this.loadExpenses(0);
  }

  protected onExpLazy(e: TableLazyLoadEvent): void {
    this.loadExpenses(e.first ?? 0);
  }

  loadExpenses(first: number): void {
    const r = this.expRange;
    if (!r?.[0] || !r[1]) return;
    this.expFirst.set(first);
    this.expLoading.set(true);
    this.api.expenses(isoDate(r[0]), isoDate(r[1]), this.expCategory(), Math.floor(first / PAGE), PAGE).subscribe({
      next: (l) => {
        this.expenses.set(l);
        this.expLoading.set(false);
      },
      error: (e) => {
        this.expLoading.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  protected openExpense(x: Expense | null): void {
    this.editing.set(x);
    this.form.reset({
      category: x?.category ?? 'SUPPLIES',
      spentOn: x ? new Date(x.spentOn + 'T00:00:00') : new Date(),
      description: x?.description ?? '',
      amount: x ? toSar(x.amountHalalas) : null,
      vat: x ? toSar(x.vatHalalas) : 0,
      vendor: x?.vendor ?? '',
      reference: x?.reference ?? '',
      serviceId: x?.serviceId ?? null,
    });
    this.dialogOpen.set(true);
  }

  /** VAT included in a VAT-inclusive amount at 15%: amount × 15 / 115. */
  protected fillVat(): void {
    const amount = this.form.controls.amount.value ?? 0;
    this.form.controls.vat.setValue(Math.round((amount * 15 * 100) / 115) / 100);
  }

  protected saveExpense(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: ExpenseInput = {
      category: v.category,
      spentOn: isoDate(v.spentOn!),
      description: v.description.trim(),
      amountHalalas: toHalalas(v.amount),
      vatHalalas: toHalalas(v.vat),
      vendor: v.vendor.trim() || null,
      reference: v.reference.trim() || null,
      serviceId: v.serviceId,
    };
    this.saving.set(true);
    const x = this.editing();
    (x ? this.api.updateExpense(x.id, body) : this.api.createExpense(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
        this.loadExpenses(this.expFirst());
        if (this.isOwner) this.summary.reload();
      },
      error: (e) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  protected deleteExpense(x: Expense): void {
    this.confirm.confirm({
      header: this.translate.instant('finance.exp.deleteTitle'),
      message: this.translate.instant('finance.exp.deleteConfirm', { d: x.description }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () =>
        this.api.deleteExpense(x.id).subscribe({
          next: () => {
            this.loadExpenses(this.expFirst());
            if (this.isOwner) this.summary.reload();
          },
          error: (e) => this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) }),
        }),
    });
  }

  // ---- P&L

  protected money(h: number | null | undefined): string {
    return sarCurrency(h, this.lang.current());
  }

  protected pct(f: number | null | undefined): string {
    return pctText(f, this.lang.current());
  }

  protected g(c: number, p: number): number | null {
    return growth(c, p);
  }

  protected mn(m: number): string {
    return monthName(m, this.lang.current(), 'long');
  }

  protected readonly pnlChart = computed(() => {
    const d = this.summary.value().data;
    if (!d) return { labels: [], datasets: [] };
    const lang = this.lang.current();
    const t = (k: string) => this.translate.instant(k);
    return {
      labels: d.months.map((m) => monthName(m.month, lang)),
      datasets: [
        { type: 'line', label: t('analytics.kpi.netProfit'), data: d.months.map((m) => m.netProfitHalalas), borderColor: PALETTE[2], backgroundColor: PALETTE[2], tension: 0.3, pointRadius: 3, order: 0 },
        { type: 'bar', label: t('analytics.kpi.revenue'), data: d.months.map((m) => m.revenueHalalas), backgroundColor: PALETTE[0], stack: 'rev', borderRadius: 3, order: 1 },
        { type: 'bar', label: t('finance.salaries'), data: d.months.map((m) => m.salaryCostHalalas), backgroundColor: alpha(NEGATIVE, 0.75), stack: 'cost', order: 1 },
        { type: 'bar', label: t('finance.otherExpenses'), data: d.months.map((m) => m.expensesHalalas), backgroundColor: alpha(PALETTE[1], 0.85), stack: 'cost', borderRadius: 3, order: 1 },
      ],
    };
  });

  protected readonly pnlOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, { scales: { x: { stacked: true }, y: { ...moneyAxis(lang), beginAtZero: false } }, plugins: { tooltip: moneyTooltip(lang) } });
  });

  protected readonly moneyOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, { scales: { y: { ...moneyAxis(lang), beginAtZero: false } }, plugins: { tooltip: moneyTooltip(lang) } });
  });

  protected readonly profitChart = computed(() => {
    const d = this.summary.value().data;
    if (!d) return { labels: [], datasets: [] };
    const lang = this.lang.current();
    return {
      labels: d.months.map((m) => monthName(m.month, lang)),
      datasets: [
        { label: String(d.year), data: d.months.map((m) => m.netProfitHalalas), borderColor: POSITIVE, backgroundColor: alpha(POSITIVE, 0.1), fill: true, tension: 0.3, pointRadius: 3 },
        { label: String(d.year - 1), data: d.previousMonths.map((m) => m.netProfitHalalas), borderColor: MUTED, borderDash: [5, 4], tension: 0.3, pointRadius: 0 },
      ],
    };
  });

  protected readonly breakdownChart = computed(() => {
    const d = this.summary.value().data;
    if (!d) return { labels: [], datasets: [] };
    this.lang.current();
    const labels = [this.translate.instant('finance.salaries')];
    const values = [d.totals.salaryCostHalalas];
    const colors = [alpha(NEGATIVE, 0.75)];
    d.categories.filter((c) => c.costHalalas > 0).forEach((c, i) => {
      labels.push(this.translate.instant('expenseCategory.' + c.category));
      values.push(c.costHalalas);
      colors.push(i < PALETTE.length - 1 ? PALETTE[(i + 1) % PALETTE.length] : OTHER_COLOR);
    });
    return { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] };
  });

  protected readonly donutOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, { cutout: '60%', interaction: { mode: 'nearest', intersect: true }, scales: { x: { display: false }, y: { display: false } }, plugins: { tooltip: moneyTooltip(lang) } });
  });
  /** Read-only details with who created / last changed the record (eye button in the table). */
  protected readonly viewing = signal<Expense | null>(null);
  protected readonly viewOpen = signal(false);

  protected view(item: Expense, event?: Event): void {
    event?.stopPropagation();
    this.viewing.set(item);
    this.viewOpen.set(true);
  }

  protected viewFields(x: Expense): DetailField[] {
    return [
      { label: 'finance.exp.date', value: x.spentOn, kind: 'date' },
      { label: 'finance.exp.category', value: this.translate.instant('expenseCategory.' + x.category) },
      { label: 'finance.exp.amount', value: x.amountHalalas, kind: 'money' },
      { label: 'finance.exp.vat', value: x.vatHalalas, kind: 'money' },
      { label: 'finance.exp.vendor', value: x.vendor },
      { label: 'finance.exp.reference', value: x.reference, kind: 'ltr' },
      { label: 'finance.exp.service', value: x.serviceId ? this.svcName(x.serviceId) : null },
      { label: 'finance.exp.description', value: x.description, kind: 'multiline' },
    ];
  }

}
