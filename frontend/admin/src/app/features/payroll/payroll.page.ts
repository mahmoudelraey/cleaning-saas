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
import { TableModule } from 'primeng/table';
import { Tab, TabList, Tabs } from 'primeng/tabs';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Observable } from 'rxjs';

import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { SarPipe, toHalalas, toSar } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { isoDate } from '../analytics/analytics.api';
import { NEGATIVE, PALETTE, alpha, baseOptions, monthName, moneyAxis, moneyTooltip, sarCurrency } from '../analytics/charts';
import { loader } from '../analytics/load';
import { KpiCard, StateBlock } from '../analytics/widgets/widgets';
import { Employee, EmployeeInput, FinanceApi, PayrollPeriod, SalaryMethod, SalaryPayment, SalaryRecord, SalaryStatus } from '../finance/finance.api';
import { DetailField, DetailsDialog } from '../../shared/details-dialog/details-dialog';
import { CreatedBy } from '../../shared/details-dialog/audit-block';

type TabKey = 'month' | 'employees' | 'pending' | 'history';
const METHODS: SalaryMethod[] = ['BANK_TRANSFER', 'CASH', 'OTHER'];

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Payroll (owner only): employees and their fixed pay, the monthly salary run (generate, adjust, pay, pay all),
 * salaries still due across months and the payment history.
 */
@Component({
  selector: 'app-payroll',
  imports: [DetailsDialog, CreatedBy,
    FormsModule, ReactiveFormsModule, TranslatePipe, Tabs, TabList, Tab, Button, AppDialog, InputNumber, InputText, Select, DatePicker,
    TableModule, Tag, ToggleSwitch, UIChart, SarPipe, LocalDatePipe, KpiCard, StateBlock,
  ],
  styleUrl: './payroll.page.scss',
  templateUrl: './payroll.page.html',
})
export class PayrollPage {
  private readonly api = inject(FinanceApi);
  private readonly lang = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder);

  protected readonly tab = signal<TabKey>('month');
  protected readonly today = new Date();
  protected readonly rtl = computed(() => this.lang.current() === 'ar');
  protected readonly busy = signal(false);

  // ---- month
  protected readonly month = signal(ym(new Date()));
  protected readonly period = loader(this.month, (m) => this.api.period(m));

  // ---- employees
  protected readonly employees = signal<Employee[]>([]);
  protected readonly employeesLoading = signal(true);
  /** Team members (technicians, coordinators) whose salary is not set yet. */
  protected readonly unset = computed(() => this.employees().filter((e) => !e.salarySet));

  // ---- pending / history
  private readonly pendingKey = signal(0);
  protected readonly pendingList = loader(computed(() => (this.tab() === 'pending' ? this.pendingKey() : null)), () => this.api.pending());
  protected readonly pendingTotal = computed(() => (this.pendingList.value().data ?? []).reduce((a, r) => a + r.dueHalalas, 0));
  protected historyRange: Date[] | null = [new Date(this.today.getFullYear(), 0, 1), new Date(this.today.getFullYear(), 11, 31)];
  private readonly historyKey = signal<{ from: string; to: string } | null>(null);
  protected readonly history = loader(computed(() => (this.tab() === 'history' ? this.historyKey() : null)), (k) => this.api.history(k.from, k.to));
  protected readonly historyTotal = computed(() => (this.history.value().data ?? []).reduce((a, p) => a + p.amountHalalas, 0));
  protected readonly historyYear = computed(() => Number((this.historyKey()?.to ?? isoDate(this.today)).slice(0, 4)));
  protected readonly yearTotals = loader(computed(() => (this.tab() === 'history' ? this.historyYear() : null)), (y) => this.api.year(y));

  // ---- dialogs
  protected readonly employeeOpen = signal(false);
  protected readonly editingEmployee = signal<Employee | null>(null);
  /** The linked team member being edited: name and phone are shown, not edited (they come from the account). */
  protected readonly member = computed(() => {
    const e = this.editingEmployee();
    return e?.role ? e : null;
  });
  protected readonly dialogTitle = computed(() => {
    this.lang.current();
    const e = this.editingEmployee();
    const key = !e ? 'payroll.emp.new' : e.salarySet ? 'payroll.emp.edit' : 'payroll.emp.setSalaryFor';
    return this.translate.instant(key, { n: e?.name ?? '' });
  });
  protected readonly employeeForm = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.maxLength(150)]),
    jobTitle: this.fb.nonNullable.control(''),
    phone: this.fb.nonNullable.control(''),
    hireDate: this.fb.control<Date | null>(null),
    base: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    housing: this.fb.control<number | null>(0, Validators.min(0)),
    transport: this.fb.control<number | null>(0, Validators.min(0)),
    other: this.fb.control<number | null>(0, Validators.min(0)),
    employerCost: this.fb.control<number | null>(0, Validators.min(0)),
    active: this.fb.nonNullable.control(true),
    notes: this.fb.nonNullable.control(''),
  });

  protected readonly amountFields = [
    { key: 'base', label: 'payroll.base' },
    { key: 'allowances', label: 'payroll.allowances' },
    { key: 'overtime', label: 'payroll.overtime' },
    { key: 'bonus', label: 'payroll.bonus' },
    { key: 'deductions', label: 'payroll.deductions' },
    { key: 'employerCost', label: 'payroll.emp.employerCost' },
  ] as const;
  protected readonly recordOpen = signal(false);
  protected readonly editingRecord = signal<SalaryRecord | null>(null);
  protected readonly recordForm = this.fb.group({
    base: this.fb.control<number | null>(0, [Validators.required, Validators.min(0)]),
    allowances: this.fb.control<number | null>(0, Validators.min(0)),
    overtime: this.fb.control<number | null>(0, Validators.min(0)),
    bonus: this.fb.control<number | null>(0, Validators.min(0)),
    deductions: this.fb.control<number | null>(0, Validators.min(0)),
    employerCost: this.fb.control<number | null>(0, Validators.min(0)),
    notes: this.fb.nonNullable.control(''),
  });
  private readonly recordValues = toSignal(this.recordForm.valueChanges, { initialValue: this.recordForm.getRawValue() });
  protected readonly recordCalc = computed(() => {
    const v = this.recordValues();
    const h = (n: number | null | undefined) => toHalalas(n ?? 0);
    const gross = h(v.base) + h(v.allowances) + h(v.overtime) + h(v.bonus);
    return { gross, net: gross - h(v.deductions), cost: gross + h(v.employerCost) };
  });

  protected readonly payOpen = signal(false);
  protected readonly payingRecord = signal<SalaryRecord | null>(null);
  protected readonly payments = signal<SalaryPayment[]>([]);
  protected readonly payForm = this.fb.group({
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    method: this.fb.nonNullable.control<SalaryMethod>('BANK_TRANSFER', Validators.required),
    paidAt: this.fb.control<Date | null>(new Date(), Validators.required),
    reference: this.fb.nonNullable.control(''),
  });
  protected readonly payAllOpen = signal(false);
  protected readonly payAllForm = this.fb.group({
    method: this.fb.nonNullable.control<SalaryMethod>('BANK_TRANSFER', Validators.required),
    paidAt: this.fb.control<Date | null>(new Date(), Validators.required),
    reference: this.fb.nonNullable.control(''),
  });

  protected readonly methodOptions = computed(() => {
    this.lang.current();
    return METHODS.map((m) => ({ value: m, label: this.translate.instant('salaryMethod.' + m) }));
  });

  constructor() {
    this.loadEmployees();
    this.onHistoryRange();
  }

  protected setTab(t: TabKey): void {
    this.tab.set(t);
    if (t === 'pending') this.pendingKey.update((k) => k + 1);
  }

  protected money(h: number): string {
    return sarCurrency(h, this.lang.current());
  }

  protected monthLabel(): string {
    return this.periodLabel(this.month());
  }

  protected periodLabel(period: string): string {
    const [y, m] = period.split('-').map(Number);
    return `${monthName(m, this.lang.current(), 'long')} ${y}`;
  }

  protected shiftMonth(delta: number): void {
    const [y, m] = this.month().split('-').map(Number);
    this.month.set(ym(new Date(y, m - 1 + delta, 1)));
  }

  protected severity(s: SalaryStatus): 'success' | 'warn' | 'danger' {
    return s === 'PAID' ? 'success' : s === 'PARTIALLY_PAID' ? 'warn' : 'danger';
  }

  private run<T>(call: Observable<T>, done: (v: T) => void): void {
    this.busy.set(true);
    call.subscribe({
      next: (v) => {
        this.busy.set(false);
        done(v);
      },
      error: (e) => {
        this.busy.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  private saved(): void {
    this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
  }

  // ---- month actions

  protected generate(): void {
    this.run(this.api.generate(this.month()), () => {
      this.period.reload();
      this.saved();
    });
  }

  protected openRecord(r: SalaryRecord): void {
    this.editingRecord.set(r);
    this.recordForm.reset({
      base: toSar(r.baseHalalas),
      allowances: toSar(r.allowancesHalalas),
      overtime: toSar(r.overtimeHalalas),
      bonus: toSar(r.bonusHalalas),
      deductions: toSar(r.deductionsHalalas),
      employerCost: toSar(r.employerCostHalalas),
      notes: r.notes ?? '',
    });
    this.recordOpen.set(true);
  }

  protected saveRecord(): void {
    const r = this.editingRecord();
    if (!r || this.recordForm.invalid) return;
    const v = this.recordForm.getRawValue();
    this.run(
      this.api.updateRecord(r.id, {
        baseHalalas: toHalalas(v.base),
        allowancesHalalas: toHalalas(v.allowances),
        overtimeHalalas: toHalalas(v.overtime),
        bonusHalalas: toHalalas(v.bonus),
        deductionsHalalas: toHalalas(v.deductions),
        employerCostHalalas: toHalalas(v.employerCost),
        notes: v.notes.trim() || null,
      }),
      () => {
        this.recordOpen.set(false);
        this.period.reload();
        this.saved();
      },
    );
  }

  protected deleteRecord(r: SalaryRecord): void {
    this.confirm.confirm({
      header: this.translate.instant('payroll.deleteSalary'),
      message: this.translate.instant('payroll.deleteSalaryConfirm', { n: r.employeeName, p: this.periodLabel(r.period) }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.run(this.api.deleteRecord(r.id), () => this.period.reload()),
    });
  }

  protected openPay(r: SalaryRecord): void {
    this.payingRecord.set(r);
    this.payments.set([]);
    this.payForm.reset({ amount: toSar(r.dueHalalas), method: 'BANK_TRANSFER', paidAt: new Date(), reference: '' });
    this.api.paymentsOf(r.id).subscribe((p) => this.payments.set(p));
    this.payOpen.set(true);
  }

  protected savePayment(): void {
    const r = this.payingRecord();
    if (!r || this.payForm.invalid) return;
    const v = this.payForm.getRawValue();
    this.run(
      this.api.pay(r.id, { amountHalalas: toHalalas(v.amount), method: v.method, reference: v.reference.trim() || null, paidAt: paidAt(v.paidAt) }),
      () => {
        this.payOpen.set(false);
        this.refreshAfterPayment();
        this.saved();
      },
    );
  }

  protected deletePayment(x: SalaryPayment): void {
    this.confirm.confirm({
      header: this.translate.instant('payroll.deletePayment'),
      message: this.translate.instant('payroll.deletePaymentConfirm', { v: this.money(x.amountHalalas) }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () =>
        this.run(this.api.deletePayment(x.id), () => {
          this.payOpen.set(false);
          this.refreshAfterPayment();
        }),
    });
  }

  protected openPayAll(): void {
    this.payAllForm.reset({ method: 'BANK_TRANSFER', paidAt: new Date(), reference: '' });
    this.payAllOpen.set(true);
  }

  protected savePayAll(): void {
    if (this.payAllForm.invalid) return;
    const v = this.payAllForm.getRawValue();
    this.run(this.api.payAll(this.month(), v.method, v.reference.trim() || null, paidAt(v.paidAt)), () => {
      this.payAllOpen.set(false);
      this.refreshAfterPayment();
      this.saved();
    });
  }

  private refreshAfterPayment(): void {
    this.period.reload();
    if (this.tab() === 'pending') this.pendingList.reload();
    if (this.tab() === 'history') this.history.reload();
  }

  // ---- employees

  private loadEmployees(): void {
    this.employeesLoading.set(true);
    this.api.employees().subscribe({
      next: (e) => {
        this.employees.set(e);
        this.employeesLoading.set(false);
      },
      error: (e) => {
        this.employeesLoading.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  protected openEmployee(e: Employee | null): void {
    this.editingEmployee.set(e);
    this.employeeForm.reset({
      name: e?.name ?? '',
      jobTitle: e?.jobTitle ?? '',
      phone: e?.phone ?? '',
      hireDate: e?.hireDate ? new Date(e.hireDate + 'T00:00:00') : null,
      base: e ? toSar(e.baseSalaryHalalas) : null,
      housing: e ? toSar(e.housingHalalas) : 0,
      transport: e ? toSar(e.transportHalalas) : 0,
      other: e ? toSar(e.otherAllowancesHalalas) : 0,
      employerCost: e ? toSar(e.employerCostHalalas) : 0,
      active: e?.active ?? true,
      notes: e?.notes ?? '',
    });
    this.employeeOpen.set(true);
  }

  protected saveEmployee(): void {
    if (this.employeeForm.invalid) return;
    const v = this.employeeForm.getRawValue();
    const e = this.editingEmployee();
    if (!e?.userId && !v.name.trim()) {
      this.messages.add({ severity: 'warn', summary: this.translate.instant('errors.invalid_name') });
      return;
    }
    const body: EmployeeInput = {
      userId: e?.userId ?? null,
      name: v.name.trim(),
      jobTitle: v.jobTitle.trim() || null,
      phone: v.phone.trim() || null,
      baseSalaryHalalas: toHalalas(v.base),
      housingHalalas: toHalalas(v.housing),
      transportHalalas: toHalalas(v.transport),
      otherAllowancesHalalas: toHalalas(v.other),
      employerCostHalalas: toHalalas(v.employerCost),
      hireDate: v.hireDate ? isoDate(v.hireDate) : null,
      active: v.active,
      notes: v.notes.trim() || null,
    };
    this.run(e?.id ? this.api.updateEmployee(e.id, body) : this.api.createEmployee(body), () => {
      this.employeeOpen.set(false);
      this.loadEmployees();
      this.period.reload();
      this.saved();
    });
  }

  protected deleteEmployee(e: Employee): void {
    this.confirm.confirm({
      header: this.translate.instant('payroll.emp.deleteTitle'),
      message: this.translate.instant('payroll.emp.deleteConfirm', { n: e.name }),
      acceptLabel: this.translate.instant('common.delete'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.run(this.api.deleteEmployee(e.id!), () => this.loadEmployees()),
    });
  }

  // ---- history

  protected onHistoryRange(): void {
    const r = this.historyRange;
    if (r?.[0] && r[1]) this.historyKey.set({ from: isoDate(r[0]), to: isoDate(r[1]) });
  }

  protected readonly yearChart = computed(() => {
    const rows = this.yearTotals.value().data ?? [];
    const lang = this.lang.current();
    return {
      labels: rows.map((_, i) => monthName(i + 1, lang)),
      datasets: [
        { label: this.translate.instant('payroll.net'), data: rows.map((r) => r.netHalalas), backgroundColor: PALETTE[0], stack: 'c', borderRadius: 3 },
        { label: this.translate.instant('payroll.deductionsAndEmployer'), data: rows.map((r) => r.costHalalas - r.netHalalas), backgroundColor: alpha(NEGATIVE, 0.5), stack: 'c', borderRadius: 3 },
      ],
    };
  });

  protected readonly yearOptions = computed(() => {
    const lang = this.lang.current();
    return baseOptions(lang, { scales: { x: { stacked: true }, y: { stacked: true, ...moneyAxis(lang) } }, plugins: { tooltip: moneyTooltip(lang) } });
  });
  /** Read-only details with who created / last changed the record (eye button in the table). */
  protected readonly viewing = signal<Employee | null>(null);
  protected readonly viewOpen = signal(false);

  protected view(item: Employee, event?: Event): void {
    event?.stopPropagation();
    this.viewing.set(item);
    this.viewOpen.set(true);
  }

  protected viewFields(x: Employee): DetailField[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { label: 'payroll.emp.name', value: x.name },
      { label: 'payroll.emp.jobTitle', value: x.jobTitle },
      { label: 'payroll.emp.phone', value: x.phone, kind: 'phone' },
      { label: 'payroll.emp.account', value: x.role ? t('roles.' + x.role) : t('payroll.emp.noAccount') },
      { label: 'common.status', value: t(x.active ? 'common.active' : 'common.inactive'), kind: 'status', on: x.active },
      { label: 'payroll.base', value: x.baseSalaryHalalas, kind: 'money' },
      { label: 'payroll.allowances', value: x.housingHalalas + x.transportHalalas + x.otherAllowancesHalalas, kind: 'money' },
      { label: 'payroll.emp.monthlyCost', value: x.monthlyCostHalalas, kind: 'money' },
      { label: 'payroll.emp.hireDate', value: x.hireDate, kind: 'date' },
      { label: 'payroll.notes', value: x.notes, kind: 'multiline' },
    ];
  }
}

/** Noon local time of the chosen day, so the payment lands on that day in any time zone close to the company's. */
function paidAt(d: Date | null): string | null {
  if (!d) return null;
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  return x.toISOString();

}
