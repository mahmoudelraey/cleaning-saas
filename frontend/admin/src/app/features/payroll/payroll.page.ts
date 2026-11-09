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
import { KpiCard, StateBlock } from '../analytics/widgets';
import { Employee, EmployeeInput, FinanceApi, PayrollPeriod, SalaryMethod, SalaryPayment, SalaryRecord, SalaryStatus } from '../finance/finance.api';

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
  imports: [
    FormsModule, ReactiveFormsModule, TranslatePipe, Tabs, TabList, Tab, Button, Dialog, InputNumber, InputText, Select, DatePicker,
    TableModule, Tag, ToggleSwitch, UIChart, SarPipe, LocalDatePipe, KpiCard, StateBlock,
  ],
  styles: `
    .tabs { margin-bottom: 1rem; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: .85rem; margin-bottom: .85rem; }
    .bar { display: flex; justify-content: space-between; align-items: center; gap: .6rem; flex-wrap: wrap; margin-bottom: .85rem; }
    .month { display: inline-flex; align-items: center; gap: .25rem; font-weight: 700; font-size: 1.05rem; }
    .actions { display: flex; gap: .5rem; flex-wrap: wrap; }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    td small { display: block; color: var(--fo-muted); }
    .block { margin-bottom: .85rem; }
    h2 { font-size: 1rem; margin: 0 0 .25rem; }
    .sub { color: var(--fo-muted); font-size: .8rem; margin: 0 0 .75rem; }
    .calc { background: #f8fafc; border-radius: 10px; padding: .75rem 1rem; display: grid; gap: .25rem; font-size: .9rem; }
    .calc div { display: flex; justify-content: space-between; gap: 1rem; }
    .calc strong { font-variant-numeric: tabular-nums; }
    .pays { list-style: none; margin: .5rem 0 0; padding: 0; display: grid; gap: .35rem; }
    .pays li { display: flex; justify-content: space-between; align-items: center; gap: .5rem; font-size: .9rem; border-bottom: 1px solid var(--fo-border); padding: .3rem 0; }
    .filters { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--fo-border); }
    .filters .total { margin-inline-start: auto; color: var(--fo-muted); }
    .member { display: grid; gap: .15rem; background: #f8fafc; border-radius: 10px; padding: .65rem 1rem; }
    .banner { display: flex; gap: .75rem; align-items: center; justify-content: space-between; flex-wrap: wrap; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 10px; padding: .65rem 1rem; margin-bottom: .85rem; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'payroll.title' | translate }}</h1>
        <p>{{ 'payroll.subtitle' | translate }}</p>
      </div>
      @if (tab() === 'employees') {
        <p-button icon="pi pi-plus" [label]="'payroll.emp.new' | translate" (onClick)="openEmployee(null)" />
      }
    </div>

    <p-tabs class="tabs" [value]="tab()" (valueChange)="setTab($any($event))" [scrollable]="true">
      <p-tablist>
        <p-tab value="month"><i class="pi pi-calendar"></i> {{ 'payroll.tab.month' | translate }}</p-tab>
        <p-tab value="employees"><i class="pi pi-users"></i> {{ 'payroll.tab.employees' | translate }}</p-tab>
        <p-tab value="pending"><i class="pi pi-clock"></i> {{ 'payroll.tab.pending' | translate }}</p-tab>
        <p-tab value="history"><i class="pi pi-history"></i> {{ 'payroll.tab.history' | translate }}</p-tab>
      </p-tablist>
    </p-tabs>

    @switch (tab()) {
      @case ('month') {
        <div class="bar">
          <span class="month">
            <p-button [icon]="rtl() ? 'pi pi-chevron-right' : 'pi pi-chevron-left'" [text]="true" [rounded]="true" (onClick)="shiftMonth(-1)" [ariaLabel]="'payroll.prevMonth' | translate" />
            <span>{{ monthLabel() }}</span>
            <p-button [icon]="rtl() ? 'pi pi-chevron-left' : 'pi pi-chevron-right'" [text]="true" [rounded]="true" (onClick)="shiftMonth(1)" [ariaLabel]="'payroll.nextMonth' | translate" />
          </span>
          @if (period.value().data; as p) {
            <span class="actions">
              @if (p.totals.dueHalalas > 0) {
                <p-button icon="pi pi-send" [label]="'payroll.payAll' | translate" (onClick)="openPayAll()" />
              }
            </span>
          }
        </div>
        @let v = period.value();
        @if (v.state === 'error') {
          <div class="panel"><app-state kind="error" [message]="v.error" (retry)="period.reload()" /></div>
        } @else if (!v.data) {
          <div class="panel"><app-state kind="loading" /></div>
        } @else {
          @let p = v.data;
          @if (unset().length) {
            <div class="banner">
              <span><i class="pi pi-user-plus"></i> {{ 'payroll.unsetMembers' | translate: { n: unset().length } }}</span>
              <p-button size="small" [outlined]="true" [label]="'payroll.setSalaries' | translate" (onClick)="setTab('employees')" />
            </div>
          }
          @if (p.missing > 0) {
            <div class="banner">
              <span><i class="pi pi-info-circle"></i> {{ 'payroll.missing' | translate: { n: p.missing } }}</span>
              <p-button size="small" icon="pi pi-bolt" [label]="'payroll.generate' | translate" [loading]="busy()" (onClick)="generate()" />
            </div>
          }
          <div class="kpis">
            <app-kpi icon="pi pi-users" [label]="'payroll.kpi.employees' | translate" [value]="'' + p.totals.employees" [hint]="'payroll.kpi.paidOf' | translate: { n: p.totals.paid, t: p.totals.employees }" />
            <app-kpi icon="pi pi-wallet" [label]="'payroll.kpi.gross' | translate" [value]="money(p.totals.grossHalalas)" />
            <app-kpi icon="pi pi-money-bill" [label]="'payroll.kpi.net' | translate" [value]="money(p.totals.netHalalas)" [hint]="'payroll.kpi.netHint' | translate" />
            <app-kpi icon="pi pi-check-circle" [label]="'payroll.kpi.paid' | translate" [value]="money(p.totals.paidHalalas)" />
            <app-kpi icon="pi pi-clock" [label]="'payroll.kpi.due' | translate" [value]="money(p.totals.dueHalalas)" [negative]="p.totals.dueHalalas > 0" />
            <app-kpi icon="pi pi-building" [label]="'payroll.kpi.cost' | translate" [value]="money(p.totals.costHalalas)" [hint]="'payroll.kpi.costHint' | translate" />
          </div>
          <div class="panel-flush">
            <p-table [value]="p.records" dataKey="id" [rowHover]="true">
              <ng-template #header>
                <tr>
                  <th>{{ 'payroll.employee' | translate }}</th>
                  <th class="num">{{ 'payroll.base' | translate }}</th>
                  <th class="num">{{ 'payroll.allowances' | translate }}</th>
                  <th class="num">{{ 'payroll.overtimeBonus' | translate }}</th>
                  <th class="num">{{ 'payroll.deductions' | translate }}</th>
                  <th class="num">{{ 'payroll.net' | translate }}</th>
                  <th class="num">{{ 'payroll.paid' | translate }}</th>
                  <th>{{ 'common.status' | translate }}</th>
                  <th></th>
                </tr>
              </ng-template>
              <ng-template #body let-r>
                <tr>
                  <td>{{ r.employeeName }}@if (r.jobTitle) {<small>{{ r.jobTitle }}</small>}</td>
                  <td class="num"><span class="ltr">{{ r.baseHalalas | sar }}</span></td>
                  <td class="num"><span class="ltr">{{ r.allowancesHalalas | sar }}</span></td>
                  <td class="num"><span class="ltr">{{ r.overtimeHalalas + r.bonusHalalas | sar }}</span></td>
                  <td class="num"><span class="ltr">{{ r.deductionsHalalas | sar }}</span></td>
                  <td class="num"><strong class="ltr">{{ r.netHalalas | sar }}</strong></td>
                  <td class="num"><span class="ltr">{{ r.paidHalalas | sar }}</span></td>
                  <td><p-tag [value]="'salaryStatus.' + r.status | translate" [severity]="severity(r.status)" /></td>
                  <td class="row-actions">
                    @if (r.dueHalalas > 0) {
                      <p-button icon="pi pi-money-bill" [text]="true" (onClick)="openPay(r)" [ariaLabel]="'payroll.recordPayment' | translate" />
                    }
                    <p-button icon="pi pi-pencil" [text]="true" severity="secondary" (onClick)="openRecord(r)" [ariaLabel]="'common.edit' | translate" />
                    @if (r.paidHalalas === 0) {
                      <p-button icon="pi pi-trash" [text]="true" severity="danger" (onClick)="deleteRecord(r)" [ariaLabel]="'common.delete' | translate" />
                    }
                  </td>
                </tr>
              </ng-template>
              <ng-template #emptymessage>
                <tr><td colspan="9"><div class="empty"><i class="pi pi-calendar"></i>{{ (employees().length ? 'payroll.emptyMonth' : 'payroll.noEmployees') | translate }}</div></td></tr>
              </ng-template>
            </p-table>
          </div>
        }
      }

      @case ('employees') {
        @if (unset().length) {
          <div class="banner"><span><i class="pi pi-info-circle"></i> {{ 'payroll.unsetHint' | translate: { n: unset().length } }}</span></div>
        }
        <div class="panel-flush">
          <p-table [value]="employees()" [rowHover]="true" [loading]="employeesLoading()">
            <ng-template #header>
              <tr>
                <th>{{ 'payroll.emp.name' | translate }}</th>
                <th>{{ 'payroll.emp.account' | translate }}</th>
                <th class="num">{{ 'payroll.base' | translate }}</th>
                <th class="num">{{ 'payroll.allowances' | translate }}</th>
                <th class="num">{{ 'payroll.emp.monthlyCost' | translate }}</th>
                <th>{{ 'common.status' | translate }}</th>
                <th></th>
              </tr>
            </ng-template>
            <ng-template #body let-e>
              <tr>
                <td>{{ e.name }}@if (e.jobTitle) {<small>{{ e.jobTitle }}</small>}</td>
                <td>
                  @if (e.role) {
                    <p-tag [value]="'roles.' + e.role | translate" severity="info" />
                    @if (!e.accountActive) { <small>{{ 'payroll.emp.accountOff' | translate }}</small> }
                  } @else {
                    <span class="muted">{{ 'payroll.emp.noAccount' | translate }}</span>
                  }
                </td>
                @if (e.salarySet) {
                  <td class="num"><span class="ltr">{{ e.baseSalaryHalalas | sar }}</span></td>
                  <td class="num"><span class="ltr">{{ e.housingHalalas + e.transportHalalas + e.otherAllowancesHalalas | sar }}</span></td>
                  <td class="num"><span class="ltr">{{ e.monthlyCostHalalas | sar }}</span></td>
                  <td><p-tag [value]="(e.active ? 'common.active' : 'common.inactive') | translate" [severity]="e.active ? 'success' : 'secondary'" /></td>
                  <td class="row-actions">
                    <p-button icon="pi pi-pencil" [text]="true" severity="secondary" (onClick)="openEmployee(e)" [ariaLabel]="'common.edit' | translate" />
                    <p-button icon="pi pi-trash" [text]="true" severity="danger" (onClick)="deleteEmployee(e)" [ariaLabel]="'common.delete' | translate" />
                  </td>
                } @else {
                  <td colspan="3" class="muted">{{ 'payroll.emp.salaryNotSet' | translate }}</td>
                  <td><p-tag [value]="'payroll.emp.notSetTag' | translate" severity="warn" /></td>
                  <td class="row-actions">
                    <p-button size="small" icon="pi pi-wallet" [label]="'payroll.emp.setSalary' | translate" (onClick)="openEmployee(e)" />
                  </td>
                }
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              <tr><td colspan="7"><div class="empty"><i class="pi pi-users"></i>{{ 'payroll.noEmployees' | translate }}</div></td></tr>
            </ng-template>
          </p-table>
        </div>
      }

      @case ('pending') {
        @let v = pendingList.value();
        @if (v.state === 'error') {
          <div class="panel"><app-state kind="error" [message]="v.error" (retry)="pendingList.reload()" /></div>
        } @else {
          <div class="panel-flush">
            <div class="filters"><span>{{ 'payroll.pendingHint' | translate }}</span><span class="total">{{ 'payroll.kpi.due' | translate }}: <strong class="ltr">{{ pendingTotal() | sar }}</strong></span></div>
            <p-table [value]="v.data ?? []" dataKey="id" [rowHover]="true" [loading]="v.state === 'loading'">
              <ng-template #header>
                <tr>
                  <th>{{ 'payroll.month' | translate }}</th>
                  <th>{{ 'payroll.employee' | translate }}</th>
                  <th class="num">{{ 'payroll.net' | translate }}</th>
                  <th class="num">{{ 'payroll.paid' | translate }}</th>
                  <th class="num">{{ 'payroll.kpi.due' | translate }}</th>
                  <th>{{ 'common.status' | translate }}</th>
                  <th></th>
                </tr>
              </ng-template>
              <ng-template #body let-r>
                <tr>
                  <td>{{ periodLabel(r.period) }}</td>
                  <td>{{ r.employeeName }}</td>
                  <td class="num"><span class="ltr">{{ r.netHalalas | sar }}</span></td>
                  <td class="num"><span class="ltr">{{ r.paidHalalas | sar }}</span></td>
                  <td class="num"><strong class="ltr">{{ r.dueHalalas | sar }}</strong></td>
                  <td><p-tag [value]="'salaryStatus.' + r.status | translate" [severity]="severity(r.status)" /></td>
                  <td class="row-actions"><p-button icon="pi pi-money-bill" [text]="true" (onClick)="openPay(r)" [ariaLabel]="'payroll.recordPayment' | translate" /></td>
                </tr>
              </ng-template>
              <ng-template #emptymessage>
                <tr><td colspan="7"><div class="empty"><i class="pi pi-check-circle"></i>{{ 'payroll.nothingDue' | translate }}</div></td></tr>
              </ng-template>
            </p-table>
          </div>
        }
      }

      @case ('history') {
        <div class="panel block">
          <h2>{{ 'payroll.yearCost' | translate: { y: historyYear() } }}</h2>
          <p class="sub">{{ 'payroll.yearCostHint' | translate }}</p>
          @if (yearTotals.value().data) {
            <p-chart type="bar" [data]="yearChart()" [options]="yearOptions()" height="240px" />
          } @else if (yearTotals.value().state === 'error') {
            <app-state kind="error" [message]="yearTotals.value().error" (retry)="yearTotals.reload()" />
          } @else {
            <app-state kind="loading" />
          }
        </div>
        <div class="panel-flush">
          <div class="filters">
            <p-datepicker [(ngModel)]="historyRange" (ngModelChange)="onHistoryRange()" selectionMode="range" [readonlyInput]="true" [showIcon]="true" dateFormat="yy-mm-dd" appendTo="body" />
            <span class="total">{{ 'payroll.totalPaid' | translate }}: <strong class="ltr">{{ historyTotal() | sar }}</strong></span>
          </div>
          @let h = history.value();
          <p-table [value]="h.data ?? []" dataKey="id" [rowHover]="true" [loading]="h.state === 'loading'" [paginator]="(h.data?.length ?? 0) > 25" [rows]="25">
            <ng-template #header>
              <tr>
                <th>{{ 'payroll.paidAt' | translate }}</th>
                <th>{{ 'payroll.employee' | translate }}</th>
                <th>{{ 'payroll.month' | translate }}</th>
                <th>{{ 'payroll.method' | translate }}</th>
                <th class="num">{{ 'payroll.amount' | translate }}</th>
              </tr>
            </ng-template>
            <ng-template #body let-x>
              <tr>
                <td>{{ x.paidAt | ldate: 'medium' }}</td>
                <td>{{ x.employeeName }}</td>
                <td>{{ x.period ? periodLabel(x.period) : '—' }}</td>
                <td>{{ 'salaryMethod.' + x.method | translate }}@if (x.reference) {<small class="ltr">{{ x.reference }}</small>}</td>
                <td class="num"><span class="ltr">{{ x.amountHalalas | sar }}</span></td>
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              <tr><td colspan="5"><div class="empty"><i class="pi pi-history"></i>{{ 'payroll.noPayments' | translate }}</div></td></tr>
            </ng-template>
          </p-table>
        </div>
      }
    }

    <!-- Employee -->
    <p-dialog [header]="dialogTitle()" [(visible)]="employeeOpen" [modal]="true"
              [style]="{ width: '680px', maxWidth: '95vw' }" [draggable]="false">
      <form [formGroup]="employeeForm" (ngSubmit)="saveEmployee()" class="form-grid">
        @if (member(); as m) {
          <div class="member full">
            <strong>{{ m.name }}</strong>
            <span class="muted"><span class="ltr">{{ m.phone }}</span> · {{ 'roles.' + m.role | translate }}</span>
            <small class="hint">{{ 'payroll.emp.fromAccount' | translate }}</small>
          </div>
        } @else {
          <div class="field">
            <label for="p-name">{{ 'payroll.emp.name' | translate }}</label>
            <input pInputText id="p-name" formControlName="name" maxlength="150" />
          </div>
          <div class="field">
            <label for="p-phone">{{ 'payroll.emp.phone' | translate }}</label>
            <input pInputText id="p-phone" formControlName="phone" dir="ltr" maxlength="20" />
          </div>
        }
        <div class="field">
          <label for="p-title">{{ 'payroll.emp.jobTitle' | translate }}</label>
          <input pInputText id="p-title" formControlName="jobTitle" maxlength="100" />
        </div>
        <div class="field">
          <label for="p-hire">{{ 'payroll.emp.hireDate' | translate }}</label>
          <p-datepicker inputId="p-hire" formControlName="hireDate" dateFormat="yy-mm-dd" [showIcon]="true" appendTo="body" />
        </div>
        <div class="field">
          <label for="p-base">{{ 'payroll.base' | translate }}</label>
          <p-inputnumber inputId="p-base" formControlName="base" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
        </div>
        <div class="field">
          <label for="p-housing">{{ 'payroll.emp.housing' | translate }}</label>
          <p-inputnumber inputId="p-housing" formControlName="housing" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
        </div>
        <div class="field">
          <label for="p-transport">{{ 'payroll.emp.transport' | translate }}</label>
          <p-inputnumber inputId="p-transport" formControlName="transport" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
        </div>
        <div class="field">
          <label for="p-other">{{ 'payroll.emp.otherAllowances' | translate }}</label>
          <p-inputnumber inputId="p-other" formControlName="other" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
        </div>
        <div class="field">
          <label for="p-employer">{{ 'payroll.emp.employerCost' | translate }}</label>
          <p-inputnumber inputId="p-employer" formControlName="employerCost" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
          <small class="hint">{{ 'payroll.emp.employerCostHint' | translate }}</small>
        </div>
        <div class="field full">
          <label for="p-notes">{{ 'payroll.notes' | translate }}</label>
          <input pInputText id="p-notes" formControlName="notes" maxlength="1000" />
        </div>
        @if (editingEmployee()?.salarySet) {
          <div class="field">
            <label for="p-active">{{ 'common.active' | translate }}</label>
            <p-toggleswitch inputId="p-active" formControlName="active" />
          </div>
        }
        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="employeeOpen.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [loading]="busy()" [disabled]="employeeForm.invalid" />
        </div>
      </form>
    </p-dialog>

    <!-- Salary amounts -->
    <p-dialog [header]="'payroll.editSalary' | translate: { n: editingRecord()?.employeeName ?? '' }" [(visible)]="recordOpen" [modal]="true"
              [style]="{ width: '620px', maxWidth: '95vw' }" [draggable]="false">
      <form [formGroup]="recordForm" (ngSubmit)="saveRecord()" class="form-grid">
        @for (f of amountFields; track f.key) {
          <div class="field">
            <label [for]="'r-' + f.key">{{ f.label | translate }}</label>
            <p-inputnumber [inputId]="'r-' + f.key" [formControlName]="f.key" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
          </div>
        }
        <div class="field full">
          <label for="r-notes">{{ 'payroll.notes' | translate }}</label>
          <input pInputText id="r-notes" formControlName="notes" maxlength="1000" />
        </div>
        <div class="calc full">
          <div><span>{{ 'payroll.gross' | translate }}</span><strong class="ltr">{{ recordCalc().gross | sar }}</strong></div>
          <div><span>{{ 'payroll.net' | translate }}</span><strong class="ltr">{{ recordCalc().net | sar }}</strong></div>
          <div class="muted"><span>{{ 'payroll.kpi.cost' | translate }}</span><span class="ltr">{{ recordCalc().cost | sar }}</span></div>
        </div>
        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="recordOpen.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [loading]="busy()" [disabled]="recordForm.invalid || recordCalc().net < 0" />
        </div>
      </form>
    </p-dialog>

    <!-- Payment -->
    <p-dialog [header]="'payroll.recordPaymentFor' | translate: { n: payingRecord()?.employeeName ?? '' }" [(visible)]="payOpen" [modal]="true"
              [style]="{ width: '520px', maxWidth: '95vw' }" [draggable]="false">
      @if (payingRecord(); as r) {
        <p class="muted" style="margin-top: 0">{{ 'payroll.dueNow' | translate: { v: money(r.dueHalalas), p: periodLabel(r.period) } }}</p>
      }
      <form [formGroup]="payForm" (ngSubmit)="savePayment()" class="form-grid">
        <div class="field">
          <label for="pay-amount">{{ 'payroll.amount' | translate }}</label>
          <p-inputnumber inputId="pay-amount" formControlName="amount" mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0.01" suffix=" SAR" />
        </div>
        <div class="field">
          <label for="pay-method">{{ 'payroll.method' | translate }}</label>
          <p-select inputId="pay-method" formControlName="method" [options]="methodOptions()" optionLabel="label" optionValue="value" appendTo="body" />
        </div>
        <div class="field">
          <label for="pay-date">{{ 'payroll.paidAt' | translate }}</label>
          <p-datepicker inputId="pay-date" formControlName="paidAt" dateFormat="yy-mm-dd" [showIcon]="true" [maxDate]="today" appendTo="body" />
        </div>
        <div class="field">
          <label for="pay-ref">{{ 'payroll.reference' | translate }}</label>
          <input pInputText id="pay-ref" formControlName="reference" dir="ltr" maxlength="100" />
        </div>
        @if (payments().length) {
          <div class="full">
            <strong>{{ 'payroll.previousPayments' | translate }}</strong>
            <ul class="pays">
              @for (x of payments(); track x.id) {
                <li>
                  <span>{{ x.paidAt | ldate: 'mediumDate' }} · {{ 'salaryMethod.' + x.method | translate }}</span>
                  <span><span class="ltr">{{ x.amountHalalas | sar }}</span>
                    <p-button icon="pi pi-times" size="small" [text]="true" severity="danger" (onClick)="deletePayment(x)" [ariaLabel]="'common.delete' | translate" /></span>
                </li>
              }
            </ul>
          </div>
        }
        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="payOpen.set(false)" />
          <p-button type="submit" [label]="'payroll.recordPayment' | translate" [loading]="busy()" [disabled]="payForm.invalid" />
        </div>
      </form>
    </p-dialog>

    <!-- Pay all -->
    <p-dialog [header]="'payroll.payAllTitle' | translate: { m: monthLabel() }" [(visible)]="payAllOpen" [modal]="true" [style]="{ width: '480px', maxWidth: '95vw' }" [draggable]="false">
      <p class="muted" style="margin-top: 0">{{ 'payroll.payAllHint' | translate: { v: money(period.value().data?.totals?.dueHalalas ?? 0) } }}</p>
      <form [formGroup]="payAllForm" (ngSubmit)="savePayAll()" class="form-grid">
        <div class="field">
          <label for="pa-method">{{ 'payroll.method' | translate }}</label>
          <p-select inputId="pa-method" formControlName="method" [options]="methodOptions()" optionLabel="label" optionValue="value" appendTo="body" />
        </div>
        <div class="field">
          <label for="pa-date">{{ 'payroll.paidAt' | translate }}</label>
          <p-datepicker inputId="pa-date" formControlName="paidAt" dateFormat="yy-mm-dd" [showIcon]="true" [maxDate]="today" appendTo="body" />
        </div>
        <div class="field full">
          <label for="pa-ref">{{ 'payroll.reference' | translate }}</label>
          <input pInputText id="pa-ref" formControlName="reference" dir="ltr" maxlength="100" />
        </div>
        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="payAllOpen.set(false)" />
          <p-button type="submit" icon="pi pi-send" [label]="'payroll.payAll' | translate" [loading]="busy()" [disabled]="payAllForm.invalid" />
        </div>
      </form>
    </p-dialog>
  `,
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
}

/** Noon local time of the chosen day, so the payment lands on that day in any time zone close to the company's. */
function paidAt(d: Date | null): string | null {
  if (!d) return null;
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  return x.toISOString();
}
