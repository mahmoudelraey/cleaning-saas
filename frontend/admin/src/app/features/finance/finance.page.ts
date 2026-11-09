import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
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
import { KpiCard, StateBlock } from '../analytics/widgets';
import { EXPENSE_CATEGORIES, Expense, ExpenseCategory, ExpenseInput, FinanceApi, ExpenseList } from './finance.api';

type TabKey = 'pnl' | 'expenses';
const PAGE = 25;

/**
 * Financial management: profit and loss by month against the previous year (owner only, it includes salaries)
 * and the operating-expenses ledger (owner, or coordinators given the Expenses screen).
 */
@Component({
  selector: 'app-finance',
  imports: [
    FormsModule, ReactiveFormsModule, TranslatePipe, UIChart, Tabs, TabList, Tab, Button, Dialog, InputNumber, InputText, Select,
    DatePicker, TableModule, Tag, Tooltip, SarPipe, LocalDatePipe, KpiCard, StateBlock,
  ],
  styles: `
    .tabs { margin-bottom: 1rem; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: .85rem; margin-bottom: .85rem; }
    .grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: .85rem; margin-bottom: .85rem; }
    @media (max-width: 980px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .block { margin-bottom: .85rem; }
    h2 { font-size: 1rem; margin: 0 0 .25rem; display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .sub { color: var(--fo-muted); font-size: .8rem; margin: 0 0 .75rem; }
    .year { display: inline-flex; align-items: center; gap: .25rem; font-weight: 700; font-size: 1.05rem; }
    .table-wrap { overflow-x: auto; }
    table.pnl { width: 100%; border-collapse: collapse; font-size: .88rem; min-width: 820px; }
    table.pnl th { text-align: start; color: var(--fo-muted); font-weight: 600; padding: .45rem .35rem; border-bottom: 1px solid var(--fo-border); white-space: nowrap; }
    table.pnl td { padding: .5rem .35rem; border-bottom: 1px solid var(--fo-border); }
    table.pnl tfoot td { font-weight: 700; border-top: 2px solid var(--fo-border); }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .up { color: #15803d; } .down { color: #b91c1c; }
    .filters { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--fo-border); }
    .filters .total { margin-inline-start: auto; color: var(--fo-muted); }
    .filters .total strong { color: var(--fo-text); }
    .vat { display: flex; gap: .4rem; align-items: center; }
    .vat p-inputnumber { flex: 1; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'finance.title' | translate }}</h1>
        <p>{{ 'finance.subtitle' | translate }}</p>
      </div>
      @if (tab() === 'expenses') {
        <p-button icon="pi pi-plus" [label]="'finance.exp.new' | translate" (onClick)="openExpense(null)" />
      }
    </div>

    @if (isOwner) {
      <p-tabs class="tabs" [value]="tab()" (valueChange)="tab.set($any($event))">
        <p-tablist>
          <p-tab value="pnl"><i class="pi pi-chart-bar"></i> {{ 'finance.tab.pnl' | translate }}</p-tab>
          <p-tab value="expenses"><i class="pi pi-receipt"></i> {{ 'finance.tab.expenses' | translate }}</p-tab>
        </p-tablist>
      </p-tabs>
    }

    @if (tab() === 'pnl' && isOwner) {
      @let v = summary.value();
      <div class="panel block" style="display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap">
        <span class="year">
          <p-button [icon]="rtl() ? 'pi pi-chevron-right' : 'pi pi-chevron-left'" [text]="true" [rounded]="true" (onClick)="year.set(year() - 1)" [ariaLabel]="'finance.prevYear' | translate" />
          <span class="ltr">{{ year() }}</span>
          <p-button [icon]="rtl() ? 'pi pi-chevron-left' : 'pi pi-chevron-right'" [text]="true" [rounded]="true" (onClick)="year.set(year() + 1)" [disabled]="year() >= thisYear" [ariaLabel]="'finance.nextYear' | translate" />
        </span>
        <span class="muted">{{ 'finance.vsYear' | translate: { y: year() - 1 } }}</span>
      </div>
      @if (v.state === 'error') {
        <div class="panel"><app-state kind="error" [message]="v.error" (retry)="summary.reload()" /></div>
      } @else if (!v.data) {
        <div class="panel"><app-state kind="loading" /></div>
      } @else {
        @let d = v.data;
        <div class="kpis" [style.opacity]="v.state === 'loading' ? .6 : 1">
          <app-kpi icon="pi pi-wallet" [label]="'analytics.kpi.revenue' | translate" [value]="money(d.totals.revenueHalalas)" [delta]="g(d.totals.revenueHalalas, d.previousTotals.revenueHalalas)" [hint]="'finance.excludingVat' | translate" />
          <app-kpi icon="pi pi-arrow-circle-up" [label]="'analytics.kpi.expenses' | translate" [value]="money(d.totals.totalCostHalalas)" [delta]="g(d.totals.totalCostHalalas, d.previousTotals.totalCostHalalas)" [invert]="true"
                   [hint]="'finance.costSplit' | translate: { s: money(d.totals.salaryCostHalalas), e: money(d.totals.expensesHalalas) }" />
          <app-kpi icon="pi pi-chart-line" [label]="'analytics.kpi.netProfit' | translate" [value]="money(d.totals.netProfitHalalas)" [negative]="d.totals.netProfitHalalas < 0"
                   [delta]="g(d.totals.netProfitHalalas, d.previousTotals.netProfitHalalas)" [hint]="'analytics.kpi.margin' | translate: { m: pct(d.totals.profitMargin) }" />
          <app-kpi icon="pi pi-money-bill" [label]="'analytics.kpi.collected' | translate" [value]="money(d.totals.collectedHalalas)" [delta]="g(d.totals.collectedHalalas, d.previousTotals.collectedHalalas)"
                   [hint]="'finance.outstanding' | translate: { v: money(d.outstandingHalalas) }" />
          <app-kpi icon="pi pi-users" [label]="'finance.salariesPaid' | translate" [value]="money(d.salariesPaidHalalas)" [hint]="'finance.salariesDue' | translate: { v: money(d.salariesDueHalalas) }" />
        </div>

        <div class="grid">
          <div class="panel">
            <h2>{{ 'finance.monthly' | translate }}</h2>
            <p class="sub">{{ 'finance.monthlyHint' | translate }}</p>
            <p-chart type="bar" [data]="pnlChart()" [options]="pnlOptions()" height="320px" />
          </div>
          <div class="panel">
            <h2>{{ 'finance.breakdown' | translate }}</h2>
            <p class="sub">{{ 'finance.breakdownHint' | translate }}</p>
            @if (d.totals.totalCostHalalas > 0) {
              <p-chart type="doughnut" [data]="breakdownChart()" [options]="donutOptions()" height="320px" />
            } @else {
              <app-state kind="empty" [message]="'finance.noCosts' | translate" />
            }
          </div>
        </div>

        <div class="panel block">
          <h2>{{ 'finance.profitTrend' | translate }}</h2>
          <p class="sub">{{ 'finance.profitTrendHint' | translate }}</p>
          <p-chart type="line" [data]="profitChart()" [options]="moneyOptions()" height="260px" />
        </div>

        <div class="panel block">
          <h2>{{ 'finance.statement' | translate }}</h2>
          <p class="sub">{{ 'finance.statementHint' | translate }}</p>
          <div class="table-wrap">
            <table class="pnl">
              <thead>
                <tr>
                  <th>{{ 'finance.month' | translate }}</th>
                  <th class="num">{{ 'analytics.kpi.revenue' | translate }}</th>
                  <th class="num">{{ 'finance.salaries' | translate }}</th>
                  <th class="num">{{ 'finance.otherExpenses' | translate }}</th>
                  <th class="num">{{ 'analytics.kpi.netProfit' | translate }}</th>
                  <th class="num">{{ 'analytics.margin' | translate }}</th>
                  <th class="num">{{ 'finance.profitLastYear' | translate }}</th>
                  <th class="num">{{ 'analytics.kpi.collected' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (m of d.months; track m.month; let i = $index) {
                  @let pm = d.previousMonths[i];
                  <tr>
                    <td>{{ mn(m.month) }}</td>
                    <td class="num"><span class="ltr">{{ money(m.revenueHalalas) }}</span></td>
                    <td class="num"><span class="ltr">{{ money(m.salaryCostHalalas) }}</span></td>
                    <td class="num"><span class="ltr">{{ money(m.expensesHalalas) }}</span></td>
                    <td class="num" [class.up]="m.netProfitHalalas > 0" [class.down]="m.netProfitHalalas < 0"><span class="ltr">{{ money(m.netProfitHalalas) }}</span></td>
                    <td class="num">{{ m.revenueHalalas ? pct(m.netProfitHalalas / m.revenueHalalas) : '—' }}</td>
                    <td class="num muted"><span class="ltr">{{ money(pm.netProfitHalalas) }}</span></td>
                    <td class="num"><span class="ltr">{{ money(m.collectedHalalas) }}</span></td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td>{{ 'finance.total' | translate }}</td>
                  <td class="num"><span class="ltr">{{ money(d.totals.revenueHalalas) }}</span></td>
                  <td class="num"><span class="ltr">{{ money(d.totals.salaryCostHalalas) }}</span></td>
                  <td class="num"><span class="ltr">{{ money(d.totals.expensesHalalas) }}</span></td>
                  <td class="num" [class.up]="d.totals.netProfitHalalas > 0" [class.down]="d.totals.netProfitHalalas < 0"><span class="ltr">{{ money(d.totals.netProfitHalalas) }}</span></td>
                  <td class="num">{{ pct(d.totals.profitMargin) }}</td>
                  <td class="num muted"><span class="ltr">{{ money(d.previousTotals.netProfitHalalas) }}</span></td>
                  <td class="num"><span class="ltr">{{ money(d.totals.collectedHalalas) }}</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      }
    } @else {
      <div class="panel-flush">
        <div class="filters">
          <p-datepicker [(ngModel)]="expRange" (ngModelChange)="onExpRange()" selectionMode="range" [readonlyInput]="true" [showIcon]="true" dateFormat="yy-mm-dd"
                        [ariaLabel]="'analytics.period' | translate" appendTo="body" />
          <p-select [options]="categoryOptions()" [ngModel]="expCategory()" (ngModelChange)="expCategory.set($event); loadExpenses(0)" optionLabel="label" optionValue="value"
                    [showClear]="true" [placeholder]="'finance.exp.allCategories' | translate" appendTo="body" />
          @if (expenses(); as e) {
            <span class="total">{{ 'finance.exp.total' | translate }}: <strong class="ltr">{{ e.totalCostHalalas | sar }}</strong> · {{ 'finance.exp.count' | translate: { n: e.total } }}</span>
          }
        </div>
        <p-table [value]="expenses()?.items ?? []" [lazy]="true" (onLazyLoad)="onExpLazy($event)" [paginator]="true" [rows]="pageSize" [first]="expFirst()"
                 [totalRecords]="expenses()?.total ?? 0" [loading]="expLoading()" dataKey="id" [rowHover]="true">
          <ng-template #header>
            <tr>
              <th>{{ 'finance.exp.date' | translate }}</th>
              <th>{{ 'finance.exp.category' | translate }}</th>
              <th>{{ 'finance.exp.description' | translate }}</th>
              <th style="text-align: end">{{ 'finance.exp.amount' | translate }}</th>
              <th style="text-align: end">{{ 'finance.exp.vat' | translate }}</th>
              <th></th>
            </tr>
          </ng-template>
          <ng-template #body let-x>
            <tr>
              <td>{{ x.spentOn | ldate: 'mediumDate' }}</td>
              <td><p-tag [value]="'expenseCategory.' + x.category | translate" severity="secondary" /></td>
              <td>
                {{ x.description }}
                @if (x.vendor || x.serviceId) {
                  <div><small class="muted">{{ x.vendor }}@if (x.vendor && x.serviceId) { · }@if (x.serviceId) {<i class="pi pi-tag" style="font-size: .7rem"></i> {{ svcName(x.serviceId) }}}</small></div>
                }
              </td>
              <td style="text-align: end"><span class="ltr">{{ x.amountHalalas | sar }}</span></td>
              <td style="text-align: end" class="muted"><span class="ltr">{{ x.vatHalalas | sar }}</span></td>
              <td class="row-actions">
                <p-button icon="pi pi-pencil" [text]="true" severity="secondary" (onClick)="openExpense(x)" [ariaLabel]="'common.edit' | translate" />
                <p-button icon="pi pi-trash" [text]="true" severity="danger" (onClick)="deleteExpense(x)" [ariaLabel]="'common.delete' | translate" />
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="6"><div class="empty"><i class="pi pi-receipt"></i>{{ 'finance.exp.empty' | translate }}</div></td></tr>
          </ng-template>
        </p-table>
      </div>
    }

    <p-dialog [header]="(editing() ? 'finance.exp.edit' : 'finance.exp.new') | translate" [(visible)]="dialogOpen" [modal]="true"
              [style]="{ width: '620px', maxWidth: '95vw' }" [draggable]="false">
      <form [formGroup]="form" (ngSubmit)="saveExpense()" class="form-grid">
        <div class="field">
          <label for="e-cat">{{ 'finance.exp.category' | translate }}</label>
          <p-select inputId="e-cat" formControlName="category" [options]="categoryOptions()" optionLabel="label" optionValue="value" appendTo="body" />
        </div>
        <div class="field">
          <label for="e-date">{{ 'finance.exp.date' | translate }}</label>
          <p-datepicker inputId="e-date" formControlName="spentOn" dateFormat="yy-mm-dd" [showIcon]="true" [maxDate]="today" appendTo="body" />
        </div>
        <div class="field full">
          <label for="e-desc">{{ 'finance.exp.description' | translate }}</label>
          <input pInputText id="e-desc" formControlName="description" maxlength="300" />
        </div>
        <div class="field">
          <label for="e-amount">{{ 'finance.exp.amountIncl' | translate }}</label>
          <p-inputnumber inputId="e-amount" formControlName="amount" mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
        </div>
        <div class="field">
          <label for="e-vat">{{ 'finance.exp.vat' | translate }}</label>
          <div class="vat">
            <p-inputnumber inputId="e-vat" formControlName="vat" mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
            <p-button size="small" [outlined]="true" label="15%" (onClick)="fillVat()" [pTooltip]="'finance.exp.vatHint' | translate" />
          </div>
        </div>
        <div class="field">
          <label for="e-vendor">{{ 'finance.exp.vendor' | translate }}</label>
          <input pInputText id="e-vendor" formControlName="vendor" maxlength="150" />
        </div>
        <div class="field">
          <label for="e-ref">{{ 'finance.exp.reference' | translate }}</label>
          <input pInputText id="e-ref" formControlName="reference" maxlength="100" dir="ltr" />
        </div>
        <div class="field full">
          <label for="e-svc">{{ 'finance.exp.service' | translate }}</label>
          <p-select inputId="e-svc" formControlName="serviceId" [options]="serviceOptions()" optionLabel="label" optionValue="value" [showClear]="true"
                    [placeholder]="'finance.exp.serviceNone' | translate" appendTo="body" />
          <small class="hint">{{ 'finance.exp.serviceHint' | translate }}</small>
        </div>
        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="dialogOpen.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [loading]="saving()" [disabled]="form.invalid" />
        </div>
      </form>
    </p-dialog>
  `,
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
}
