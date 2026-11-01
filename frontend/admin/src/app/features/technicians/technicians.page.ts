import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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

import { DayOfWeek, Technician, WorkShift } from '../../core/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { TenantService } from '../../core/tenant.service';
import { PhonePipe, SAUDI_MOBILE_PATTERN } from '../../shared/format';
import { ResetPasswordDialog } from '../../shared/reset-password.dialog';
import { STRONG_PASSWORD } from '../auth/change-password.page';

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
    PhonePipe,
    ResetPasswordDialog,
  ],
  styles: `
    .shift { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: .5rem; align-items: center; }
    .shift > * { min-width: 0; width: 100%; }
    .shift p-button { width: auto; }
    .shift + .shift { margin-top: .5rem; }
    .shift input { direction: ltr; text-align: center; }
    h3 { margin: .5rem 0; font-size: 1rem; }
    input[type='color'] { width: 56px; height: 38px; padding: 2px; border: 1px solid var(--fo-border); border-radius: 6px; background: none; }
    .skills { display: flex; gap: .35rem; flex-wrap: wrap; }
  `,
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'technicians.title' | translate }}</h1>
        <p>
          {{ 'technicians.subtitle' | translate }}
          @if (tenants.tenant(); as t) {
            · {{ 'technicians.planUsage' | translate: { used: activeCount(), max: t.plan.maxTechnicians } }}
          }
        </p>
      </div>
      @if (isOwner) {
        <p-button icon="pi pi-plus" [label]="'technicians.new' | translate" (onClick)="open(null)" />
      }
    </div>

    <div class="panel-flush">
      <p-table [value]="technicians()" [loading]="loading()" [rowHover]="true" dataKey="id">
        <ng-template #header>
          <tr>
            <th>{{ 'technicians.name' | translate }}</th>
            <th>{{ 'technicians.phone' | translate }}</th>
            <th>{{ 'technicians.skills' | translate }}</th>
            <th>{{ 'technicians.workDays' | translate }}</th>
            <th>{{ 'common.status' | translate }}</th>
            @if (isOwner) {
              <th></th>
            }
          </tr>
        </ng-template>
        <ng-template #body let-t>
          <tr>
            <td><span class="color-dot" [style.background]="t.color"></span>{{ t.name }}</td>
            <td><span class="ltr">{{ t.phone | phone }}</span></td>
            <td>
              <div class="skills">
                @for (s of t.skills; track s) {
                  <p-tag [value]="s" severity="secondary" />
                }
              </div>
            </td>
            <td class="muted">{{ workDays(t) }}</td>
            <td>
              <p-tag [value]="(t.active ? 'common.active' : 'common.inactive') | translate" [severity]="t.active ? 'success' : 'secondary'" />
              @if (t.mustChangePassword) {
                <div><small class="muted"><i class="pi pi-key"></i> {{ 'password.pending' | translate }}</small></div>
              }
            </td>
            @if (isOwner) {
              <td class="row-actions">
                <p-button icon="pi pi-key" [text]="true" severity="secondary" (onClick)="resetFor.set(t)" [ariaLabel]="'password.reset' | translate" />
                <p-button icon="pi pi-pencil" [text]="true" severity="secondary" (onClick)="open(t)" />
              </td>
            }
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="6"><div class="empty"><i class="pi pi-wrench"></i>{{ 'technicians.empty' | translate }}</div></td>
          </tr>
        </ng-template>
      </p-table>
    </div>

    @if (resetFor(); as rt) {
      <app-reset-password-dialog [visible]="true" (visibleChange)="!$event && resetFor.set(null)" [name]="rt.name"
                                 [url]="'/api/v1/technicians/' + rt.id + '/password'" (done)="reload()" />
    }

    <p-dialog
      [header]="(editing() ? 'technicians.edit' : 'technicians.new') | translate"
      [(visible)]="dialogOpen"
      [modal]="true"
      [style]="{ width: '680px', maxWidth: '95vw' }"
      [draggable]="false"
    >
      @if (error()) {
        <p-message severity="error">{{ error() }}</p-message>
      }
      <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
        <div class="field">
          <label for="t-name">{{ 'technicians.name' | translate }}</label>
          <input pInputText id="t-name" formControlName="name" />
        </div>
        <div class="field">
          <label for="t-phone">{{ 'technicians.phone' | translate }}</label>
          <input pInputText id="t-phone" formControlName="phone" dir="ltr" placeholder="05XXXXXXXX" />
          @if (editing()) {
            <small class="hint">{{ 'technicians.phoneLocked' | translate }}</small>
          }
        </div>
        <div class="field">
          <label for="t-email">{{ 'technicians.emailOptional' | translate }}</label>
          <input pInputText id="t-email" formControlName="email" type="email" dir="ltr" />
        </div>
        @if (!editing()) {
          <div class="field">
            <label for="t-pass">{{ 'technicians.initialPassword' | translate }}</label>
            <p-password inputId="t-pass" formControlName="password" [feedback]="false" [toggleMask]="true" [fluid]="true" />
            <small class="hint">{{ 'technicians.passwordHint' | translate }}</small>
          </div>
        }
        <div class="field">
          <label for="t-skills">{{ 'technicians.skills' | translate }}</label>
          <input pInputText id="t-skills" formControlName="skills" [placeholder]="'technicians.skillsHint' | translate" />
        </div>
        <div class="field">
          <label for="t-color">{{ 'technicians.color' | translate }}</label>
          <input id="t-color" type="color" formControlName="color" />
        </div>
        @if (editing()) {
          <div class="field">
            <label for="t-active">{{ 'common.active' | translate }}</label>
            <p-toggleswitch inputId="t-active" formControlName="active" />
          </div>
        }

        <div class="full">
          <h3>{{ 'technicians.workHours' | translate }}</h3>
          <div formArrayName="workHours">
            @for (g of shifts.controls; track g; let i = $index) {
              <div class="shift" [formGroupName]="i">
                <p-select formControlName="day" [options]="dayOptions()" optionLabel="label" optionValue="value" />
                <input pInputText formControlName="start" placeholder="08:00" />
                <input pInputText formControlName="end" placeholder="17:00" />
                <p-button icon="pi pi-times" [text]="true" severity="danger" (onClick)="shifts.removeAt(i)" />
              </div>
            }
          </div>
          <p-button icon="pi pi-plus" size="small" [text]="true" [label]="'technicians.addShift' | translate" (onClick)="addShift()" />
        </div>

        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="dialogOpen.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [loading]="saving()" [disabled]="form.invalid" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class TechniciansPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);
  protected readonly tenants = inject(TenantService);
  protected readonly isOwner = inject(AuthService).hasRole('OWNER');

  protected readonly technicians = signal<Technician[]>([]);
  protected readonly activeCount = signal(0);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<Technician | null>(null);
  protected readonly resetFor = signal<Technician | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly dayOptions = () =>
    DAYS.map((d) => ({ value: d, label: this.translate.instant('days.' + d) }));

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    phone: ['', [Validators.required, Validators.pattern(SAUDI_MOBILE_PATTERN)]],
    email: ['', [Validators.email]],
    password: ['', [Validators.required, Validators.pattern(STRONG_PASSWORD)]],
    skills: [''],
    color: ['#0EA5A4'],
    active: [true],
    workHours: this.fb.array<ShiftGroup>([]),
  });

  get shifts(): FormArray<ShiftGroup> {
    return this.form.controls.workHours;
  }

  ngOnInit(): void {
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
      skills: t?.skills.join('، ') ?? '',
      color: t?.color ?? '#0EA5A4',
      active: t?.active ?? true,
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
    const skills = v.skills
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
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
