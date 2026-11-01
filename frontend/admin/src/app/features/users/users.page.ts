import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';

import { Role, StaffUser } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { ResetPasswordDialog } from '../../shared/reset-password.dialog';
import { STRONG_PASSWORD } from '../auth/change-password.page';
import { errorMessage } from '../../core/http/api-error';
import { PhonePipe, SAUDI_MOBILE_PATTERN } from '../../shared/format';
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
    Password,
    Select,
    ToggleSwitch,
    Tag,
    Message,
    LocalDatePipe,
    PhonePipe,
    ResetPasswordDialog,
  ],
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
            <td>{{ 'roles.' + u.role | translate }}</td>
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
          <p-select inputId="u-role" formControlName="role" [options]="roleOptions()" optionLabel="label" optionValue="value" />
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
        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="dialogOpen.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [loading]="saving()" [disabled]="form.invalid" />
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
  protected readonly myId = this.auth.user()?.id;

  protected readonly staff = signal<StaffUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<StaffUser | null>(null);
  protected readonly resetFor = signal<StaffUser | null>(null);
  protected readonly error = signal<string | null>(null);

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
  });

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
    });
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
    const req$ = u
      ? this.http.put<StaffUser>(`${BASE}/${u.id}`, { name: v.name, email: v.email || null, role: v.role, active: v.active })
      : this.http.post<StaffUser>(BASE, {
          name: v.name,
          phone: v.phone,
          email: v.email || null,
          password: v.password,
          role: v.role,
        });
    this.saving.set(true);
    req$.subscribe({
      next: () => {
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
