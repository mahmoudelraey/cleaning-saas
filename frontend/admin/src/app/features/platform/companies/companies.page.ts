import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { Drawer } from 'primeng/drawer';
import { NotificationSettingsPanel } from '../../settings/notification-settings/notification-settings.panel';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Observable, Subject, debounceTime } from 'rxjs';

import { errorMessage } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { PhonePipe } from '../../../shared/format';
import { LocalDatePipe } from '../../../shared/local-date.pipe';
import { isoDate } from '../../analytics/analytics.api';
import { sarCurrency } from '../../analytics/charts';
import {
  BillingCycle,
  CompanyDetail,
  CompanyFilter,
  CompanyRow,
  GooglePlace,
  PlanRow,
  PlatformApi,
  daysUntil,
  statusSeverity,
} from '../platform.api';

/** All companies on FieldOps; open one to change its plan, trial or paid period, or to suspend it. */
@Component({
  selector: 'app-platform-companies',
  imports: [FormsModule, TranslatePipe, TableModule, Tag, Button, Drawer, Select, SelectButton, DatePicker, InputNumber, InputText, PhonePipe, LocalDatePipe, NotificationSettingsPanel],
  styleUrl: './companies.page.scss',
  templateUrl: './companies.page.html',
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

  /** This company's own limits being edited; null = use the plan's (shown as placeholder). */
  protected limTech: number | null = null;
  protected limMessages: number | null = null;
  protected limBookings: number | null = null;

  protected planValue(v: number | null): string {
    return v === null ? this.translate.instant('platform.limits.unlimited') : String(v);
  }

  protected shown(v: number | null): string {
    return v === null ? '∞' : String(v);
  }

  // ---- Google Maps listing ----
  protected gQuery = '';
  protected readonly gResults = signal<GooglePlace[] | null>(null);
  protected readonly gSearching = signal(false);

  protected searchGoogle(c: CompanyRow): void {
    const q = this.gQuery.trim();
    if (!q) return;
    this.gSearching.set(true);
    this.api.searchCompanyGoogle(c.id, q, this.lang.current()).subscribe({
      next: (r) => {
        this.gSearching.set(false);
        this.gResults.set(r);
      },
      error: (e) => {
        this.gSearching.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(e, this.translate) });
      },
    });
  }

  protected connectGoogle(c: CompanyRow, place: GooglePlace | null): void {
    this.run(this.api.setCompanyGoogle(c.id, place?.placeId ?? null, place?.name ?? null));
  }

  private show(d: CompanyDetail): void {
    const c = d.company;
    this.detail.set(d);
    this.limTech = d.limits.maxTechniciansOverride;
    this.limMessages = d.limits.monthlyMessagesOverride;
    this.limBookings = d.limits.monthlyBookingsOverride;
    this.gQuery = c.name;
    this.gResults.set(null);
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
