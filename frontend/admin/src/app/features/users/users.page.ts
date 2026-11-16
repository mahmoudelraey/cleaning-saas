import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { AppDialog } from '../../shared/dialog/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { DEFAULT_COORDINATOR_SCREENS, Role, SCREEN_GROUPS, Screen, StaffUser } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { ResetPasswordDialog } from '../../shared/reset-password/reset-password.dialog';
import { STRONG_PASSWORD } from '../auth/change-password/change-password.page';
import { errorMessage } from '../../core/http/api-error';
import { PhonePipe, SAUDI_MOBILE_PATTERN, toHalalas } from '../../shared/format';
import { TenantService } from '../../core/tenant.service';
import { FinanceApi } from '../finance/finance.api';
import { LocalDatePipe } from '../../shared/local-date.pipe';
import { DetailField, DetailsDialog } from '../../shared/details-dialog/details-dialog';
import { CreatedBy } from '../../shared/details-dialog/audit-block';

const BASE = '/api/v1/users';

@Component({
  selector: 'app-users',
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
    ToggleSwitch,
    Tag,
    Message,
    LocalDatePipe,
    PhonePipe,
    ResetPasswordDialog,
  ],
  styleUrl: './users.page.scss',
  templateUrl: './users.page.html',
})
export class UsersPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);
  private readonly finance = inject(FinanceApi);
  protected readonly myId = this.auth.user()?.id;

  protected readonly staff = signal<StaffUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<StaffUser | null>(null);
  protected readonly resetFor = signal<StaffUser | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly groups = SCREEN_GROUPS;
  protected readonly allScreens: Screen[] = SCREEN_GROUPS.flatMap((g) => g.screens);
  protected readonly role = signal<Role>('COORDINATOR');
  protected readonly screens = signal<Set<Screen>>(new Set(DEFAULT_COORDINATOR_SCREENS));

  protected toggle(s: Screen, on: boolean): void {
    this.screens.update((set) => {
      const next = new Set(set);
      if (on) next.add(s);
      else next.delete(s);
      return next;
    });
  }

  protected setGroup(list: Screen[], on: boolean): void {
    list.forEach((s) => this.toggle(s, on));
  }

  protected readonly roleOptions = computed(() =>
    (['OWNER', 'COORDINATOR'] as Role[]).map((r) => ({ value: r, label: this.translate.instant('roles.' + r) })),
  );

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    phone: ['', [Validators.required, Validators.pattern(SAUDI_MOBILE_PATTERN)]],
    email: ['', [Validators.email]],
    password: ['', [Validators.required, Validators.pattern(STRONG_PASSWORD)]],
    role: ['COORDINATOR' as Role, Validators.required],
    active: [true],
    salary: [null as number | null, [Validators.min(0)]],
  });

  /** Owners on a plan with payroll can enter the monthly salary while adding the person. */
  protected readonly canSetSalary = this.auth.hasRole('OWNER') && !inject(TenantService).locked('reports');

  /** Creates the payroll entry for a new account; the account itself is already saved, so failures only warn. */
  private setUpSalary(userId: string, salarySar: number | null): void {
    if (!this.canSetSalary || !salarySar || salarySar <= 0) return;
    this.finance.setUpSalary(userId, toHalalas(salarySar)).subscribe({
      error: () => this.messages.add({ severity: 'warn', summary: this.translate.instant('payroll.salaryNotSaved') }),
    });
  }


  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.http.get<StaffUser[]>(BASE).subscribe({
      next: (u) => {
        this.staff.set(u);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  open(u: StaffUser | null): void {
    this.editing.set(u);
    this.error.set(null);
    this.form.reset({
      name: u?.name ?? '',
      phone: u?.phone ?? '',
      email: u?.email ?? '',
      password: '',
      role: u?.role ?? 'COORDINATOR',
      active: u?.active ?? true,
      salary: null,
    });
    this.role.set(u?.role ?? 'COORDINATOR');
    this.screens.set(new Set(u?.role === 'COORDINATOR' ? (u.screens ?? DEFAULT_COORDINATOR_SCREENS) : DEFAULT_COORDINATOR_SCREENS));
    const lock = !!u;
    for (const c of [this.form.controls.phone, this.form.controls.password]) {
      if (lock) {
        c.disable();
      } else {
        c.enable();
      }
    }
    // Owners cannot demote or deactivate themselves (also enforced by the API).
    if (u && u.id === this.auth.user()?.id) {
      this.form.controls.role.disable();
      this.form.controls.active.disable();
    } else {
      this.form.controls.role.enable();
      this.form.controls.active.enable();
    }
    this.dialogOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const u = this.editing();
    // Kept in the sidebar order; only sent for coordinators.
    const screens = v.role === 'COORDINATOR' ? this.allScreens.filter((s) => this.screens().has(s)) : null;
    const req$ = u
      ? this.http.put<StaffUser>(`${BASE}/${u.id}`, { name: v.name, email: v.email || null, role: v.role, active: v.active, screens })
      : this.http.post<StaffUser>(BASE, {
          name: v.name,
          phone: v.phone,
          email: v.email || null,
          password: v.password,
          role: v.role,
          screens,
        });
    this.saving.set(true);
    req$.subscribe({
      next: (saved) => {
        if (!u && v.role === 'COORDINATOR') this.setUpSalary(saved.id, v.salary);
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
  protected readonly viewing = signal<StaffUser | null>(null);
  protected readonly viewOpen = signal(false);

  protected view(item: StaffUser, event?: Event): void {
    event?.stopPropagation();
    this.viewing.set(item);
    this.viewOpen.set(true);
  }

  protected viewFields(x: StaffUser): DetailField[] {
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    return [
      { label: 'users.name', value: x.name },
      { label: 'users.phone', value: x.phone, kind: 'phone' },
      { label: 'users.emailOptional', value: x.email ?? null, kind: 'ltr' },
      { label: 'users.role', value: t('roles.' + x.role) },
      { label: 'common.status', value: t(x.active ? 'common.active' : 'common.inactive'), kind: 'status', on: x.active },
      { label: 'users.lastLogin', value: x.lastLoginAt ?? null, kind: 'datetime' },
      ...(x.role === 'COORDINATOR'
        ? [{ label: 'users.screens', value: (x.screens ?? []).map((sc) => t('users.screen.' + sc)).join('، '), full: true }]
        : []),
    ];
  }

}
