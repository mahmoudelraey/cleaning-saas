import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Textarea } from 'primeng/textarea';

import { CustomerDetail } from '../../../core/api.types';
import { errorMessage } from '../../../core/http/api-error';
import { PhonePipe, SAUDI_MOBILE_PATTERN } from '../../../shared/format';
import { CustomersApi } from '../customers.api';

/** Create/edit customer. Pass `customer` to edit; leave null to create. */
@Component({
  selector: 'app-customer-form-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Button, Dialog, InputText, Textarea, Message],
  templateUrl: './customer-form.dialog.html',
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
