import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Textarea } from 'primeng/textarea';

import { CustomerDetail } from '../../core/api.types';
import { errorMessage } from '../../core/http/api-error';
import { PhonePipe, SAUDI_MOBILE_PATTERN } from '../../shared/format';
import { CustomersApi } from './customers.api';

/** Create/edit customer. Pass `customer` to edit; leave null to create. */
@Component({
  selector: 'app-customer-form-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Dialog, InputText, Textarea, Message],
  template: `
    <p-dialog
      [header]="(customer() ? 'customers.edit' : 'customers.new') | translate"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '560px', maxWidth: '95vw' }"
      [draggable]="false"
    >
      @if (error()) {
        <p-message severity="error">{{ error() }}</p-message>
      }
      <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
        <div class="field full">
          <label for="c-name">{{ 'customers.name' | translate }}</label>
          <input pInputText id="c-name" formControlName="name" />
        </div>
        <div class="field">
          <label for="c-phone">{{ 'customers.phone' | translate }}</label>
          <input pInputText id="c-phone" formControlName="phone" dir="ltr" placeholder="05XXXXXXXX" />
          @if (form.controls.phone.touched && form.controls.phone.invalid) {
            <small class="error">{{ 'errors.invalid_phone' | translate }}</small>
          }
        </div>
        <div class="field">
          <label for="c-email">{{ 'customers.email' | translate }}</label>
          <input pInputText id="c-email" type="email" formControlName="email" dir="ltr" />
        </div>
        <div class="field full">
          <label for="c-notes">{{ 'customers.notes' | translate }}</label>
          <textarea pTextarea id="c-notes" formControlName="notes" rows="3"></textarea>
        </div>
        <div class="dialog-actions full">
          <p-button [label]="'common.cancel' | translate" severity="secondary" [text]="true" (onClick)="visible.set(false)" />
          <p-button type="submit" [label]="'common.save' | translate" [loading]="saving()" [disabled]="form.invalid" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class CustomerFormDialog {
  private readonly api = inject(CustomersApi);
  private readonly translate = inject(TranslateService);
  private readonly phonePipe = new PhonePipe();

  readonly visible = model(false);
  readonly customer = input<CustomerDetail | null>(null);
  readonly saved = output<CustomerDetail>();

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    phone: ['', [Validators.required, Validators.pattern(SAUDI_MOBILE_PATTERN)]],
    email: ['', [Validators.email]],
    notes: ['', [Validators.maxLength(2000)]],
  });

  constructor() {
    // Reset the form each time the dialog opens.
    effect(() => {
      if (!this.visible()) {
        return;
      }
      const c = this.customer();
      this.error.set(null);
      this.form.reset({
        name: c?.name ?? '',
        phone: c ? this.phonePipe.transform(c.phone, false).replace(/\s/g, '') : '',
        email: c?.email ?? '',
        notes: c?.notes ?? '',
      });
    });
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    const v = this.form.getRawValue();
    const body = { ...v, email: v.email || null, notes: v.notes || null };
    const c = this.customer();
    (c ? this.api.update(c.id, body) : this.api.create(body)).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.visible.set(false);
        this.saved.emit(res);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(errorMessage(err, this.translate));
      },
    });
  }
}
