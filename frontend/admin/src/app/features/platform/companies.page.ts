import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Drawer } from 'primeng/drawer';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Observable, Subject, debounceTime } from 'rxjs';

import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { PhonePipe } from '../../shared/format';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { isoDate } from '../analytics/analytics.api';
import { sarCurrency } from '../analytics/charts';
import { BillingCycle, CompanyDetail, CompanyFilter, CompanyRow, PlanRow, PlatformApi, daysUntil, statusSeverity } from './platform.api';

/** All companies on FieldOps; open one to change its plan, trial or paid period, or to suspend it. */
@Component({
  selector: 'app-platform-companies',
  imports: [FormsModule, TranslatePipe, TableModule, Tag, Button, Drawer, Select, SelectButton, DatePicker, InputNumber, InputText, PhonePipe, LocalDatePipe],
  styles: `
    .filters { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; padding: 1rem 1.25rem; border-bottom: 1px solid var(--fo-border); }
    .filters input { min-width: 240px; }
    td small { display: block; color: var(--fo-muted); }
    tr.row { cursor: pointer; }
    .head { display: grid; gap: .3rem; margin-bottom: 1rem; }
    .head h2 { margin: 0; font-size: 1.2rem; }
    .facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem 1rem; font-size: .9rem; margin-bottom: 1rem; }
    .facts span { color: var(--fo-muted); display: block; font-size: .8rem; }
    section.box { border: 1px solid var(--fo-border); border-radius: 12px; padding: .9rem 1rem; margin-bottom: .85rem; display: grid; gap: .6rem; }
    section.box h3 { margin: 0; font-size: .95rem; }
    .row-f { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
    .row-f > * { min-width: 0; }
    .hint { color: var(--fo-muted); font-size: .8rem; margin: 0; }
    ul.list { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; font-size: .88rem; }
    ul.list li { display: flex; justify-content: space-between; gap: .5rem; border-bottom: 1px solid var(--fo-border); padding-bottom: .35rem; }
    .note { background: #fef2f2; color: #991b1b; border-radius: 8px; padding: .5rem .75rem; font-size: .88rem; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'platform.companies.title' | translate }}</h1>
        <p>{{ 'platform.companies.subtitle' | translate }}</p>
      </div>
    </div>

    <div class="panel-flush">
      <div class="filters">
        <input pInputText type="search" [ngModel]="q()" (ngModelChange)="onSearch($event)" [placeholder]="'platform.companies.search' | translate" />
        <p-select [options]="filters()" [ngModel]="status()" (ngModelChange)="status.set($event); load()" optionLabel="label" optionValue="value" appendTo="body" />
        <span class="muted">{{ 'platform.companies.count' | translate: { n: rows().length } }}</span>
      </div>
      <p-table [value]="rows()" [loading]="loading()" dataKey="id" [rowHover]="true" [paginator]="rows().length > 25" [rows]="25">
        <ng-template #header>
          <tr>
            <th>{{ 'platform.company' | translate }}</th>
            <th>{{ 'platform.owner' | translate }}</th>
            <th>{{ 'platform.plan' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
            <th>{{ 'platform.until' | translate }}</th>
            <th>{{ 'platform.lastActive' | translate }}</th>
          </tr>
        </ng-template>
        <ng-template #body let-c>
          <tr class="row" (click)="open(c.id)">
            <td>{{ c.name }}<small class="ltr">/{{ c.slug }}</small></td>
            <td>{{ c.ownerName ?? '—' }}<small><span class="ltr">{{ c.ownerPhone | phone }}</span></small></td>
            <td>{{ planName(c.planId) }}</td>
            <td><p-tag [value]="statusLabel(c)" [severity]="sev(c)" /></td>
            <td>{{ untilText(c) }}</td>
            <td class="muted">{{ c.lastLoginAt ? (c.lastLoginAt | ldate: 'mediumDate') : '—' }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="6"><div class="empty"><i class="pi pi-building"></i>{{ 'platform.companies.empty' | translate }}</div></td></tr>
        </ng-template>
      </p-table>
    </div>

    <p-drawer [visible]="!!detail()" (visibleChange)="!$event && detail.set(null)" position="right" [modal]="true" [style]="{ width: '620px', maxWidth: '100vw' }" [blockScroll]="true">
      @if (detail(); as d) {
        @let c = d.company;
        <div class="head">
          <h2>{{ c.name }}</h2>
          <div><p-tag [value]="statusLabel(c)" [severity]="sev(c)" /> <span class="muted ltr">/{{ c.slug }}</span></div>
        </div>
        @if (c.statusNote && (c.status === 'SUSPENDED' || c.status === 'CANCELLED')) {
          <p class="note">{{ c.statusNote }}</p>
        }
        <div class="facts">
          <div><span>{{ 'platform.plan' | translate }}</span>{{ planName(c.planId) }}@if (c.billingCycle) { · {{ 'platform.cycle.' + c.billingCycle | translate }} }</div>
          <div><span>{{ 'platform.until' | translate }}</span>{{ untilText(c) }}</div>
          <div><span>{{ 'platform.owner' | translate }}</span>{{ c.ownerName ?? '—' }}</div>
          <div><span>{{ 'platform.contact' | translate }}</span>
            @if (c.ownerPhone) { <a [href]="'https://wa.me/' + c.ownerPhone.replace('+', '')" target="_blank" rel="noopener" class="ltr">{{ c.ownerPhone | phone }}</a> }
            @if (c.ownerEmail) { <div><a [href]="'mailto:' + c.ownerEmail" class="ltr">{{ c.ownerEmail }}</a></div> }
          </div>
          <div><span>{{ 'platform.signedUp' | translate }}</span>{{ c.createdAt | ldate: 'mediumDate' }}</div>
          <div><span>{{ 'platform.activeUsers' | translate }}</span>{{ c.users }}</div>
        </div>

        <section class="box">
          <h3>{{ 'platform.actions.plan' | translate }}</h3>
          <div class="row-f">
            <p-select [options]="planOptions()" [(ngModel)]="planDraft" optionLabel="label" optionValue="value" appendTo="body" />
            <p-button [label]="'common.save' | translate" [disabled]="planDraft === c.planId" [loading]="busy()" (onClick)="run(api.changePlan(c.id, planDraft))" />
          </div>
          <p class="hint">{{ 'platform.actions.planHint' | translate }}</p>
        </section>

        <section class="box">
          <h3>{{ 'platform.actions.trial' | translate }}</h3>
          <div class="row-f">
            @for (n of [7, 14, 30]; track n) {
              <p-button size="small" [outlined]="true" [label]="'+' + n + ' ' + ('platform.days' | translate)" [loading]="busy()" (onClick)="run(api.trial(c.id, { days: n }))" />
            }
            <p-inputnumber [(ngModel)]="extendDays" [min]="1" [max]="365" [showButtons]="false" [inputStyle]="{ width: '5rem' }" [ariaLabel]="'platform.days' | translate" />
            <p-button size="small" [label]="'platform.actions.extend' | translate" [loading]="busy()" (onClick)="run(api.trial(c.id, { days: extendDays }))" />
          </div>
          <div class="row-f">
            <p-datepicker [(ngModel)]="trialUntil" dateFormat="yy-mm-dd" [showIcon]="true" appendTo="body" [placeholder]="'platform.actions.trialUntil' | translate" />
            <p-button size="small" [outlined]="true" [label]="'platform.actions.setDate' | translate" [disabled]="!trialUntil" [loading]="busy()"
                      (onClick)="trialUntil && run(api.trial(c.id, { until: iso(trialUntil) }))" />
            @if (c.status === 'TRIAL' && c.usable) {
              <p-button size="small" severity="danger" [outlined]="true" [label]="'platform.actions.endTrial' | translate" (onClick)="endTrial(c)" />
            }
          </div>
          <p class="hint">{{ 'platform.actions.trialHint' | translate }}</p>
        </section>

        <section class="box">
          <h3>{{ 'platform.actions.activate' | translate }}</h3>
          <div class="row-f">
            <p-select [options]="planOptions()" [(ngModel)]="activatePlan" optionLabel="label" optionValue="value" appendTo="body" />
            <p-selectbutton [options]="cycles()" [ngModel]="cycle()" (ngModelChange)="setCycle($event)" optionLabel="label" optionValue="value" [allowEmpty]="false" size="small" />
          </div>
          <div class="row-f">
            <p-datepicker [(ngModel)]="paidUntil" dateFormat="yy-mm-dd" [showIcon]="true" appendTo="body" [minDate]="today" />
            <p-button [label]="'platform.actions.activateBtn' | translate" icon="pi pi-check" [disabled]="!paidUntil || !activatePlan" [loading]="busy()"
                      (onClick)="paidUntil && run(api.activate(c.id, activatePlan, cycle(), iso(paidUntil)))" />
          </div>
          @if (activatePrice(); as pr) {
            <p class="hint">{{ 'platform.actions.price' | translate: { v: pr } }}</p>
          }
          <p class="hint">{{ 'platform.actions.activateHint' | translate }}</p>
        </section>

        <section class="box">
          <h3>{{ 'platform.actions.access' | translate }}</h3>
          <div class="row-f">
            @if (c.status === 'SUSPENDED' || c.status === 'CANCELLED') {
              <p-button icon="pi pi-replay" [label]="'platform.actions.reactivate' | translate" [loading]="busy()" (onClick)="run(api.reactivate(c.id))" />
            } @else {
              <input pInputText [(ngModel)]="note" [placeholder]="'platform.actions.reason' | translate" style="flex: 1" />
              <p-button severity="danger" icon="pi pi-ban" [label]="'platform.actions.suspend' | translate" (onClick)="suspend(c)" />
            }
            @if (c.status !== 'CANCELLED') {
              <p-button severity="secondary" [text]="true" [label]="'platform.actions.cancel' | translate" (onClick)="cancelSub(c)" />
            }
          </div>
          <p class="hint">{{ 'platform.actions.accessHint' | translate }}</p>
        </section>

        <section class="box">
          <h3>{{ 'platform.staff' | translate }}</h3>
          <ul class="list">
            @for (u of d.staff; track u.id) {
              <li><span>{{ u.name }} · {{ 'roles.' + u.role | translate }}@if (!u.active) { <small class="muted"> ({{ 'common.inactive' | translate }})</small> }</span>
                <span class="muted ltr">{{ u.phone | phone }}</span></li>
            }
          </ul>
        </section>

        <section class="box">
          <h3>{{ 'platform.history' | translate }}</h3>
          <ul class="list">
            @for (h of d.history; track $index) {
              <li><span>{{ 'platform.audit.' + h.action | translate }}@if (h.details) { <small class="muted"> · {{ h.details }}</small> }</span>
                <span class="muted">{{ h.at | ldate: 'medium' }}</span></li>
            } @empty {
              <li class="muted">{{ 'platform.noHistory' | translate }}</li>
            }
          </ul>
        </section>
      }
    </p-drawer>
  `,
})
export class PlatformCompaniesPage {
  protected readonly api = inject(PlatformApi);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly lang = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);

  protected readonly rows = signal<CompanyRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly q = signal('');
  protected readonly status = signal<CompanyFilter>('');
  protected readonly detail = signal<CompanyDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly plans = signal<PlanRow[]>([]);
  protected readonly cycle = signal<BillingCycle>('MONTHLY');
  protected readonly today = new Date();

  protected planDraft = '';
  protected activatePlan = '';
  protected extendDays = 7;
  protected trialUntil: Date | null = null;
  protected paidUntil: Date | null = null;
  protected note = '';
  private readonly search$ = new Subject<string>();

  protected readonly filters = computed(() => {
    this.lang.current();
    return (['', 'TRIAL', 'ENDING_SOON', 'TRIAL_EXPIRED', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'] as CompanyFilter[]).map((v) => ({
      value: v,
      label: this.translate.instant('platform.filter.' + (v || 'ALL')),
    }));
  });
  protected readonly planOptions = computed(() =>
    this.plans().map((p) => ({ value: p.id, label: `${this.lang.current() === 'ar' ? p.nameAr : p.nameEn}${p.active ? '' : ' (' + this.translate.instant('platform.hidden') + ')'}` })),
  );
  protected readonly cycles = computed(() => {
    this.lang.current();
    return (['MONTHLY', 'YEARLY'] as BillingCycle[]).map((c) => ({ value: c, label: this.translate.instant('platform.cycle.' + c) }));
  });

  constructor() {
    const qp = this.route.snapshot.queryParamMap;
    this.status.set((qp.get('status') as CompanyFilter) ?? '');
    this.api.plans().subscribe((p) => this.plans.set(p.plans));
    this.search$.pipe(debounceTime(300)).subscribe(() => this.load());
    this.load();
    const openId = qp.get('open');
    if (openId) this.open(openId);
  }

  protected onSearch(v: string): void {
    this.q.set(v);
    this.search$.next(v);
  }

  load(): void {
    this.loading.set(true);
    this.api.companies(this.q(), this.status()).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  protected open(id: string): void {
    this.api.company(id).subscribe({
      next: (d) => this.show(d),
      error: (e) => this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) }),
    });
  }

  private show(d: CompanyDetail): void {
    const c = d.company;
    this.detail.set(d);
    this.planDraft = c.planId;
    this.activatePlan = c.planId;
    this.note = '';
    this.trialUntil = null;
    this.setCycle(c.billingCycle ?? 'MONTHLY');
  }

  /** Default paid period: one month or one year from today (or from the current paid end, if later). */
  protected setCycle(c: BillingCycle): void {
    this.cycle.set(c);
    const cur = this.detail()?.company.paidUntil;
    const base = cur && new Date(cur) > new Date() ? new Date(cur) : new Date();
    const d = new Date(base.getFullYear(), base.getMonth() + (c === 'MONTHLY' ? 1 : 12), base.getDate());
    this.paidUntil = d;
  }

  /** Price of the chosen plan for the chosen cycle (yearly falls back to 12 × monthly). */
  protected activatePrice(): string | null {
    const p = this.plans().find((x) => x.id === this.activatePlan);
    if (!p) return null;
    const h = this.cycle() === 'YEARLY' ? (p.priceYearlyHalalas ?? p.priceMonthlyHalalas * 12) : p.priceMonthlyHalalas;
    return sarCurrency(h, this.lang.current());
  }

  protected run(call: Observable<CompanyDetail>): void {
    this.busy.set(true);
    call.subscribe({
      next: (d) => {
        this.busy.set(false);
        this.show(d);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  protected endTrial(c: CompanyRow): void {
    this.confirm.confirm({
      header: this.translate.instant('platform.actions.endTrial'),
      message: this.translate.instant('platform.actions.endTrialConfirm', { n: c.name }),
      acceptLabel: this.translate.instant('platform.actions.endTrial'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.run(this.api.trial(c.id, { endNow: true })),
    });
  }

  protected suspend(c: CompanyRow): void {
    this.confirm.confirm({
      header: this.translate.instant('platform.actions.suspend'),
      message: this.translate.instant('platform.actions.suspendConfirm', { n: c.name }),
      acceptLabel: this.translate.instant('platform.actions.suspend'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.run(this.api.suspend(c.id, this.note.trim() || null)),
    });
  }

  protected cancelSub(c: CompanyRow): void {
    this.confirm.confirm({
      header: this.translate.instant('platform.actions.cancel'),
      message: this.translate.instant('platform.actions.cancelConfirm', { n: c.name }),
      acceptLabel: this.translate.instant('platform.actions.cancel'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.run(this.api.cancel(c.id, this.note.trim() || null)),
    });
  }

  protected iso(d: Date): string {
    return isoDate(d);
  }

  protected planName(id: string): string {
    const p = this.plans().find((x) => x.id === id);
    return p ? (this.lang.current() === 'ar' ? p.nameAr : p.nameEn) : id;
  }

  protected sev(c: CompanyRow) {
    return statusSeverity(c);
  }

  protected statusLabel(c: CompanyRow): string {
    if (c.status === 'TRIAL' && !c.usable) return this.translate.instant('platform.filter.TRIAL_EXPIRED');
    return this.translate.instant('platform.filter.' + c.status);
  }

  protected untilText(c: CompanyRow): string {
    const date = c.status === 'TRIAL' ? c.trialEndsAt : c.paidUntil;
    if (!date) return c.status === 'ACTIVE' ? this.translate.instant('platform.noEnd') : '—';
    const d = daysUntil(date) ?? 0;
    const fmt = new Intl.DateTimeFormat(this.lang.current() === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    // Stored as the start of the next day: show the last day included.
    const last = new Date(new Date(date).getTime() - 1);
    return `${fmt.format(last)} · ${d >= 0 ? this.translate.instant('platform.daysLeft', { n: d }) : this.translate.instant('platform.daysAgo', { n: -d })}`;
  }
}
