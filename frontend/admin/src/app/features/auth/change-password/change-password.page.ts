import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Password } from 'primeng/password';

import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';

/** Letters and digits, 8+ characters: mirrors the server rule (AuthService.assertStrongPassword). */
export const STRONG_PASSWORD = /^(?=.*\p{L})(?=.*\d).{8,100}$/u;

function sameAs(other: string) {
  return (c: AbstractControl): ValidationErrors | null =>
    c.parent && c.value !== c.parent.get(other)?.value ? { mismatch: true } : null;
}

/**
 * Change your own password. Forced (no way around it, server enforces too) when an owner created the
 * account or reset its password; otherwise reachable from the top bar.
 */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Button, Password],
  styleUrl: './change-password.page.scss',
  templateUrl: './change-password.page.html',
})
export class ChangePasswordPage {
  protected readonly auth = inject(AuthService);
  protected readonly lang = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly translate = inject(TranslateService);

  protected readonly forced = computed(() => this.auth.mustChangePassword());
  protected readonly saving = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    current: ['', [Validators.required]],
    next: ['', [Validators.required, Validators.pattern(STRONG_PASSWORD)]],
    confirm: ['', [Validators.required, sameAs('next')]],
  });

  constructor() {
    this.form.controls.next.valueChanges.subscribe(() => this.form.controls.confirm.updateValueAndValidity());
  }

  save(): void {
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.auth.changePassword(v.current, v.next).subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: this.translate.instant('password.changed') });
        void this.router.navigateByUrl('/');
      },
      error: (err) => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: errorMessage(err, this.translate) });
      },
    });
  }
}
