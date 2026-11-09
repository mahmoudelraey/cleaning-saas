import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
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
import { ResetPasswordDialog } from '../../shared/reset-password.dialog';
import { STRONG_PASSWORD } from '../auth/change-password.page';
import { errorMessage } from '../../core/http/api-error';
import { PhonePipe, SAUDI_MOBILE_PATTERN, toHalalas } from '../../shared/format';
import { TenantService } from '../../core/tenant.service';
import { FinanceApi } from '../finance/finance.api';
import { LocalDatePipe } from '../../shared/local-date.pipe';

const BASE = '/api/v1/users';

@Component({
  selector: 'app-users',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    TableModule,
    Button,
    Dialog,
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
  styles: `
    .screens { border: 1px solid var(--fo-border); border-radius: 12px; padding: .75rem 1rem 1rem; margin: .25rem 0 0; }
    .screens legend { font-weight: 600; padding: 0 .35rem; }
    .hint { margin: 0 0 .5rem; font-size: .85rem; }
    .group + .group { margin-top: .75rem; }
    .group-head { display: flex; align-items: center; gap: .75rem; margin-bottom: .35rem; }
    .group-head strong { font-size: .9rem; flex: 1; }
    .link { background: none; border: 0; padding: 0; cursor: pointer; color: var(--p-primary-600); font: inherit; font-size: .82rem; }
    .checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: .35rem .75rem; }
    .check { display: flex; align-items: center; gap: .45rem; font-size: .9rem; cursor: pointer; }
    .check input { width: 16px; height: 16px; accent-color: var(--p-primary-600); }
    .warn { color: var(--p-red-500); font-size: .85rem; margin: .5rem 0 0; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'users.title' | translate }}</h1>
        <p>{{ 'users.subtitle' | translate }}</p>
      </div>
      <p-button icon="pi pi-plus" [label]="'users.new' | translate" (onClick)="open(null)" />
    </div>

    <div class="panel-flush">
      <p-table [value]="staff()" [loading]="loading()" [rowHover]="true" dataKey="id">
        <ng-template #header>
          <tr>
            <th>{{ 'users.name' | translate }}</th>
            <th>{{ 'users.phone' | translate }}</th>
            <th>{{ 'users.role' | translate }}</th>
            <th>{{ 'users.lastLogin' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template #body let-u>
          <tr>
            <td>{{ u.name }}</td>
            <td><span class="ltr">{{ u.phone | phone }}</span></td>
            <td>
              {{ 'roles.' + u.role | translate }}
              @if (u.role === 'COORDINATOR') {
                <div><small class="muted">{{ 'users.screensCount' | translate: { n: u.screens?.length ?? 0, total: allScreens.length } }}</small></div>
              }
            </td>
            <td class="muted">{{ u.lastLoginAt ? (u.lastLoginAt | ldate: 'short') : '—' }}</td>
            <td>
              <p-tag [value]="(u.active ? 'common.active' : 'common.inactive') | translate" [severity]="u.active ? 'success' : 'secondary'" />
              @if (u.mustChangePassword) {
                <div><small class="muted"><i class="pi pi-key"></i> {{ 'password.pending' | translate }}</small></div>
              }
            </td>
            <td class="row-actions">
              @if (u.id !== myId) {
                <p-button icon="pi pi-key" [text]="true" severity="secondary" (onClick)="resetFor.set(u)" [ariaLabel]="'password.reset' | translate" />
              }
              @if (u.role !== 'TECHNICIAN') {
                <p-button icon="pi pi-pencil" [text]="true" severity="secondary" (onClick)="open(u)" />
              }
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>
    <p class="muted">{{ 'users.techniciansNote' | translate }}</p>
    @if (resetFor(); as ru) {
      <app-reset-password-dialog [visible]="true" (visibleChange)="!$event && resetFor.set(null)" [name]="ru.name"
                                 [url]="'/api/v1/users/' + ru.id + '/password'" (done)="reload()" />
    }

    <p-dialog
      [header]="(editing() ? 'users.edit' : 'users.new') | translate"
      [(visible)]="dialogOpen"
      [modal]="true"
      [style]="{ width: '560px', maxWidth: '95vw' }"
      [draggable]="false"
    >
      @if (error()) {
        <p-message severity="error">{{ error() }}</p-message>
      }
      <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
        <div class="field">
          <label for="u-name">{{ 'users.name' | translate }}</label>
          <input pInputText id="u-name" formControlName="name" />
        </div>
        <div class="field">
          <label for="u-role">{{ 'users.role' | translate }}</label>
          <p-select inputId="u-role" formControlName="role" [options]="roleOptions()" optionLabel="label" optionValue="value"
                    (onChange)="role.set($event.value)" />
        </div>
        <div class="field">
          <label for="u-phone">{{ 'users.phone' | translate }}</label>
          <input pInputText id="u-phone" formControlName="phone" dir="ltr" placeholder="05XXXXXXXX" />
        </div>
        <div class="field">
          <label for="u-email">{{ 'users.emailOptional' | translate }}</label>
          <input pInputText id="u-email" formControlName="email" type="email" dir="ltr" />
        </div>
        @if (!editing()) {
          <div class="field full">
            <label for="u-pass">{{ 'users.initialPassword' | translate }}</label>
            <p-password inputId="u-pass" formControlName="password" [feedback]="false" [toggleMask]="true" [fluid]="true" />
          </div>
        } @else {
          <div class="field">
            <label for="u-active">{{ 'common.active' | translate }}</label>
            <p-toggleswitch inputId="u-active" formControlName="active" />
          </div>
        }
        @if (!editing() && canSetSalary && role() === 'COORDINATOR') {
          <div class="field">
            <label for="u-salary">{{ 'payroll.monthlySalary' | translate }}</label>
            <p-inputnumber inputId="u-salary" formControlName="salary" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" suffix=" SAR" />
            <small class="hint">{{ 'payroll.monthlySalaryHint' | translate }}</small>
          </div>
        }
        @if (role() === 'COORDINATOR') {
          <fieldset class="screens full">
            <legend>{{ 'users.screens' | translate }}</legend>
            <p class="muted hint">{{ 'users.screensHint' | translate }}</p>
            @for (g of groups; track g.key) {
              <div class="group">
                <div class="group-head">
                  <strong>{{ 'shell.sections.' + g.key | translate }}</strong>
                  <button type="button" class="link" (click)="setGroup(g.screens, true)">{{ 'users.all' | translate }}</button>
                  <button type="button" class="link" (click)="setGroup(g.screens, false)">{{ 'users.none' | translate }}</button>
                </div>
                <div class="checks">
                  @for (sc of g.screens; track sc) {
                    <label class="check">
                      <input type="checkbox" [checked]="screens().has(sc)" (change)="toggle(sc, $any($event.target).checked)" />
                      {{ 'users.screen.' + sc | translate }}
                    </label>
                  }
                </div>
              </div>
            }
            @if (screens().size === 0) {
              <p class="warn">{{ 'users.screensNone' | translate }}</p>
            }
          </fieldset>
        }
        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="dialogOpen.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [loading]="saving()" [disabled]="form.invalid || (role() === 'COORDINATOR' && screens().size === 0)" />
        </div>
      </form>
    </p-dialog>
  `,
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
}
