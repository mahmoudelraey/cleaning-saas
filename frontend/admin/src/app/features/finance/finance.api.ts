import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Role } from '../../core/api.types';

// DTOs mirroring com.fieldops.app.finance.* and AnalyticsDtos.FinanceSummary. Money is in halalas.

export type ExpenseCategory =
  | 'RENT' | 'FUEL' | 'TRANSPORT' | 'SUPPLIES' | 'EQUIPMENT' | 'MAINTENANCE' | 'MARKETING' | 'UTILITIES' | 'SOFTWARE'
  | 'GOVERNMENT_FEES' | 'INSURANCE' | 'OTHER';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'RENT', 'FUEL', 'TRANSPORT', 'SUPPLIES', 'EQUIPMENT', 'MAINTENANCE', 'MARKETING', 'UTILITIES', 'SOFTWARE', 'GOVERNMENT_FEES',
  'INSURANCE', 'OTHER',
];

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amountHalalas: number;
  vatHalalas: number;
  costHalalas: number;
  spentOn: string;
  description: string;
  vendor: string | null;
  reference: string | null;
  serviceId: string | null;
  createdAt: string;
}

export interface ExpenseInput {
  category: ExpenseCategory;
  amountHalalas: number;
  vatHalalas: number;
  spentOn: string;
  description: string;
  vendor: string | null;
  reference: string | null;
  serviceId: string | null;
}

export interface ExpenseList {
  items: Expense[];
  page: number;
  size: number;
  total: number;
  totalCostHalalas: number;
}

export interface FinanceMonth {
  month: number;
  revenueHalalas: number;
  collectedHalalas: number;
  salaryCostHalalas: number;
  expensesHalalas: number;
  netProfitHalalas: number;
}

export interface FinanceTotals {
  revenueHalalas: number;
  collectedHalalas: number;
  salaryCostHalalas: number;
  expensesHalalas: number;
  totalCostHalalas: number;
  netProfitHalalas: number;
  profitMargin: number;
}

export interface FinanceSummary {
  year: number;
  months: FinanceMonth[];
  previousMonths: FinanceMonth[];
  totals: FinanceTotals;
  previousTotals: FinanceTotals;
  categories: { category: ExpenseCategory; costHalalas: number; previousCostHalalas: number }[];
  salariesPaidHalalas: number;
  salariesDueHalalas: number;
  outstandingHalalas: number;
}

export type SalaryStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID';
export type SalaryMethod = 'CASH' | 'BANK_TRANSFER' | 'OTHER';

/**
 * A payroll row. Technicians and coordinators are listed even before their salary is set (`salarySet` false,
 * `id` null); for anyone with an app account, name and phone come from the account.
 */
export interface Employee {
  id: string | null;
  userId: string | null;
  /** Role of the linked account; null = staff without an app account. */
  role: Role | null;
  accountActive: boolean;
  salarySet: boolean;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  baseSalaryHalalas: number;
  housingHalalas: number;
  transportHalalas: number;
  otherAllowancesHalalas: number;
  employerCostHalalas: number;
  monthlyGrossHalalas: number;
  monthlyCostHalalas: number;
  hireDate: string | null;
  active: boolean;
  notes: string | null;
}

/** For a linked team member the server takes name and phone from the account. */
export type EmployeeInput = Omit<Employee, 'id' | 'role' | 'accountActive' | 'salarySet' | 'monthlyGrossHalalas' | 'monthlyCostHalalas'>;

export interface SalaryRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  jobTitle: string | null;
  period: string;
  baseHalalas: number;
  allowancesHalalas: number;
  overtimeHalalas: number;
  bonusHalalas: number;
  deductionsHalalas: number;
  employerCostHalalas: number;
  grossHalalas: number;
  netHalalas: number;
  paidHalalas: number;
  dueHalalas: number;
  costHalalas: number;
  status: SalaryStatus;
  notes: string | null;
}

export interface SalaryAmounts {
  baseHalalas: number;
  allowancesHalalas: number;
  overtimeHalalas: number;
  bonusHalalas: number;
  deductionsHalalas: number;
  employerCostHalalas: number;
  notes: string | null;
}

export interface PayrollTotals {
  employees: number;
  paid: number;
  grossHalalas: number;
  netHalalas: number;
  paidHalalas: number;
  dueHalalas: number;
  costHalalas: number;
}

export interface PayrollPeriod {
  period: string;
  records: SalaryRecord[];
  totals: PayrollTotals;
  /** Active employees without a salary record for the month yet. */
  missing: number;
}

export interface SalaryPayment {
  id: string;
  recordId: string;
  employeeId: string | null;
  employeeName: string;
  period: string | null;
  amountHalalas: number;
  method: SalaryMethod;
  reference: string | null;
  paidAt: string;
}

export interface PaymentInput {
  amountHalalas: number;
  method: SalaryMethod;
  reference: string | null;
  paidAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class FinanceApi {
  private readonly http = inject(HttpClient);

  summary(year: number): Observable<FinanceSummary> {
    return this.http.get<FinanceSummary>('/api/v1/finance/summary', { params: { year } });
  }

  expenses(from: string, to: string, category: ExpenseCategory | null, page: number, size: number): Observable<ExpenseList> {
    const params: Record<string, string | number> = { from, to, page, size };
    if (category) params['category'] = category;
    return this.http.get<ExpenseList>('/api/v1/expenses', { params });
  }

  createExpense(e: ExpenseInput): Observable<Expense> {
    return this.http.post<Expense>('/api/v1/expenses', e);
  }

  updateExpense(id: string, e: ExpenseInput): Observable<Expense> {
    return this.http.put<Expense>(`/api/v1/expenses/${id}`, e);
  }

  deleteExpense(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/expenses/${id}`);
  }

  // payroll (owner only)

  employees(): Observable<Employee[]> {
    return this.http.get<Employee[]>('/api/v1/payroll/employees');
  }

  createEmployee(e: EmployeeInput): Observable<Employee> {
    return this.http.post<Employee>('/api/v1/payroll/employees', e);
  }

  updateEmployee(id: string, e: EmployeeInput): Observable<Employee> {
    return this.http.put<Employee>(`/api/v1/payroll/employees/${id}`, e);
  }

  /** Sets up the salary of a team member right after their account is created (Technicians / Team forms). */
  setUpSalary(userId: string, baseSalaryHalalas: number): Observable<Employee> {
    return this.createEmployee({
      userId,
      name: '',
      jobTitle: null,
      phone: null,
      baseSalaryHalalas,
      housingHalalas: 0,
      transportHalalas: 0,
      otherAllowancesHalalas: 0,
      employerCostHalalas: 0,
      hireDate: null,
      active: true,
      notes: null,
    });
  }

  deleteEmployee(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/payroll/employees/${id}`);
  }

  period(period: string): Observable<PayrollPeriod> {
    return this.http.get<PayrollPeriod>(`/api/v1/payroll/periods/${period}`);
  }

  generate(period: string): Observable<PayrollPeriod> {
    return this.http.post<PayrollPeriod>(`/api/v1/payroll/periods/${period}/generate`, {});
  }

  payAll(period: string, method: SalaryMethod, reference: string | null, paidAt: string | null): Observable<PayrollPeriod> {
    return this.http.post<PayrollPeriod>(`/api/v1/payroll/periods/${period}/pay-all`, { method, reference, paidAt });
  }

  updateRecord(id: string, a: SalaryAmounts): Observable<SalaryRecord> {
    return this.http.put<SalaryRecord>(`/api/v1/payroll/records/${id}`, a);
  }

  deleteRecord(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/payroll/records/${id}`);
  }

  pay(recordId: string, p: PaymentInput): Observable<SalaryRecord> {
    return this.http.post<SalaryRecord>(`/api/v1/payroll/records/${recordId}/payments`, p);
  }

  paymentsOf(recordId: string): Observable<SalaryPayment[]> {
    return this.http.get<SalaryPayment[]>(`/api/v1/payroll/records/${recordId}/payments`);
  }

  deletePayment(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/payroll/payments/${id}`);
  }

  pending(): Observable<SalaryRecord[]> {
    return this.http.get<SalaryRecord[]>('/api/v1/payroll/pending');
  }

  history(from: string, to: string): Observable<SalaryPayment[]> {
    return this.http.get<SalaryPayment[]>('/api/v1/payroll/payments', { params: { from, to } });
  }

  year(year: number): Observable<PayrollTotals[]> {
    return this.http.get<PayrollTotals[]>(`/api/v1/payroll/years/${year}`);
  }
}
