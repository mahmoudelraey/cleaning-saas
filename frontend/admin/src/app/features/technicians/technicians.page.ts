import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { AppDialog } from '../../shared/dialog/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { MultiSelect } from 'primeng/multiselect';
import { Password } from 'primeng/password';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { DayOfWeek, ServiceOffering, Technician, WorkShift } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { TenantService } from '../../core/tenant.service';
import { PhonePipe, SAUDI_MOBILE_PATTERN, toHalalas } from '../../shared/format';
import { FinanceApi } from '../finance/finance.api';
import { ResetPasswordDialog } from '../../shared/reset-password/reset-password.dialog';
import { STRONG_PASSWORD } from '../auth/change-password/change-password.page';
import { DetailField, DetailsDialog } from '../../shared/details-dialog/details-dialog';
import { CreatedBy } from '../../shared/details-dialog/audit-block';

const BASE = '/api/v1/technicians';
/** Saudi work week order. */
const DAYS: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DEFAULT_SHIFTS: WorkShift[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'].map((day) => ({
  day: day as DayOfWeek,
  start: '08:00',
  end: '17:00',
}));
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function makeShift(fb: FormBuilder, s: WorkShift) {
  return fb.nonNullable.group({
    day: [s.day, Validators.required],
    start: [s.start, [Validators.required, Validators.pattern(TIME)]],
    end: [s.end, [Validators.required, Validators.pattern(TIME)]],
  });
}
type ShiftGroup = ReturnType<typeof makeShift>;

@Component({
  selector: 'app-technicians',
  imports: [DetailsDialog, CreatedBy,
    ReactiveFormsModule,
    TranslatePipe,
    TableModule,
    Button,
    AppDialog,
    InputText,
    InputNumber,
    Password,
    Select,
    MultiSelect,
    ToggleSwitch,
    Tag,
    Message,
    PhonePipe,
    ResetPasswordDialog,
  ],
  styleUrl: './technicians.page.scss',
  templateUrl: './technicians.page.html',
})
export class TechniciansPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);
  protected readonly tenants = inject(TenantService);
  protected readonly isOwner = inject(AuthService).hasRole('OWNER');
  private readonly finance = inject(FinanceApi);

  protected readonly technicians = signal<Technician[]>([]);
  protected readonly activeCount = signal(0);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<Technician | null>(null);
  protected readonly resetFor = signal<Technician | null>(null);
  protected readonly error = signal<string | null>(null);
  private readonly lang = inject(LanguageService);
  protected readonly services = signal<ServiceOffering[]>([]);

  /** Active services, plus inactive ones the technician being edited still has. */
  protected readonly serviceOptions = computed(() => {
    const keep = new Set(this.editing()?.skills ?? []);
    return this.services()
      .filter((s) => s.active || keep.has(s.id))
      .map((s) => ({ value: s.id, label: this.name(s) }));
  });

  private name(s: ServiceOffering): string {
    return (this.lang.current() === 'en' && s.nameEn?.trim()) || s.name;
  }

  /** A service ID as its name; older free-text skills are shown as they were typed. */
  protected serviceLabel(idOrText: string): string {
    const s = this.services().find((x) => x.id === idOrText);
    return s ? this.name(s) : idOrText;
  }

  protected readonly dayOptions = () =>
    DAYS.map((d) => ({ value: d, label: this.translate.instant('days.' + d) }));

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    phone: ['', [Validators.required, Validators.pattern(SAUDI_MOBILE_PATTERN)]],
    email: ['', [Validators.email]],
    password: ['', [Validators.required, Validators.pattern(STRONG_PASSWORD)]],
    /** Services this technician does (sent to the API in the `skills` list as service IDs). */
    serviceIds: [[] as string[], [Validators.required]],
    color: ['#0EA5A4'],
    active: [true],
    salary: [null as number | null, [Validators.min(0)]],
    workHours: this.fb.array<ShiftGroup>([]),
  });

  /** Owners on a plan with payroll can enter the monthly salary while adding the person. */
  protected readonly canSetSalary = this.isOwner && !inject(TenantService).locked('payroll');

  /** Creates the payroll entry for a new account; the account itself is already saved, so failures only warn. */
  private setUpSalary(userId: string, salarySar: number | null): void {
    if (!this.canSetSalary || !salarySar || salarySar <= 0) return;
    this.finance.setUpSalary(userId, toHalalas(salarySar)).subscribe({
      error: () => this.messages.add({ severity: 'warn', summary: this.translate.instant('payroll.salaryNotSaved') }),
    });
  }


  get shifts(): FormArray<ShiftGroup> {
    return this.form.controls.workHours;
  }

  ngOnInit(): void {
    this.http.get<ServiceOffering[]>('/api/v1/services').subscribe((s) => this.services.set(s));
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.http.get<Technician[]>(BASE).subscribe({
      next: (t) => {
        this.technicians.set(t);
        this.activeCount.set(t.filter((x) => x.active).length);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  workDays(t: Technician): string {
    const days = [...new Set(t.workHours.map((s) => s.day))];
    return days.map((d) => this.translate.instant('daysShort.' + d)).join('، ') || '—';
  }

  open(t: Technician | null): void {
    this.editing.set(t);
    this.error.set(null);
    this.shifts.clear();
    this.form.reset({
      name: t?.name ?? '',
      phone: t?.phone ?? '',
      email: t?.email ?? '',
      password: '',
      // Only real service IDs; older free-text skills are dropped when the form is saved.
      serviceIds: (t?.skills ?? []).filter((x) => this.services().some((s) => s.id === x)),
      color: t?.color ?? '#0EA5A4',
      active: t?.active ?? true,
      salary: null,
    });
    // Phone is the technician's login; changing it is a separate, verified flow later.
    if (t) {
      this.form.controls.phone.disable();
      this.form.controls.password.disable();
    } else {
      this.form.controls.phone.enable();
      this.form.controls.password.enable();
    }
    (t ? t.workHours : DEFAULT_SHIFTS).forEach((s) => this.shifts.push(makeShift(this.fb, s)));
    this.dialogOpen.set(true);
  }

  addShift(): void {
    this.shifts.push(makeShift(this.fb, { day: 'SUNDAY', start: '08:00', end: '17:00' }));
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const skills = v.serviceIds;
    const editing = this.editing();
    const req$ = editing
      ? this.http.put<Technician>(`${BASE}/${editing.id}`, {
          name: v.name,
          email: v.email || null,
          skills,
          workHours: v.workHours,
          color: v.color,
          active: v.active,
        })
      : this.http.post<Technician>(BASE, {
          name: v.name,
          phone: v.phone,
          email: v.email || null,
          password: v.password,
          skills,
          workHours: v.workHours,
          color: v.color,
        });
    this.saving.set(true);
    req$.subscribe({
      next: (saved) => {
        if (!editing) this.setUpSalary(saved.userId, v.salary);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('common.saved') });
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(errorMessage(err, this.translate));
      },
    });
  }
  /** Read-only details with who created / last changed the record (eye button in the table). */
  protected readonly viewing = signal<Technician | null>(null);
  protected readonly viewOpen = signal(false);

  protected view(item: Technician, event?: Event): void {
    event?.stopPropagation();
    this.viewing.set(item);
    this.viewOpen.set(true);
  }

  protected viewFields(x: Technician): DetailField[] {
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    return [
      { label: 'technicians.name', value: x.name },
      { label: 'technicians.phone', value: x.phone, kind: 'phone' },
      { label: 'users.emailOptional', value: x.email ?? null, kind: 'ltr' },
      { label: 'common.status', value: t(x.active ? 'common.active' : 'common.inactive'), kind: 'status', on: x.active },
      { label: 'technicians.rating', value: x.ratingAverage != null ? x.ratingAverage.toFixed(1) + ' / 5 · ' + t('technicians.ratingCount', { n: x.ratingCount }) : t('technicians.noRating') },
      { label: 'technicians.workDays', value: this.workDays(x) },
      { label: 'users.lastLogin', value: x.lastLoginAt ?? null, kind: 'datetime' },
      { label: 'technicians.skills', value: (x.skills ?? []).map((s) => this.serviceLabel(s)).join('، '), full: true },
    ];
  }

}
