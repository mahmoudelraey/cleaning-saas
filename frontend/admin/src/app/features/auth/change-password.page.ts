import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Password } from 'primeng/password';

import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';

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
  styles: `
    :host { display: grid; place-items: center; min-height: 100vh; padding: 1.25rem; background: var(--fo-bg); }
    .card { width: 100%; max-width: 420px; }
    .icon { font-size: 2.2rem; color: var(--p-primary-500); display: block; margin-bottom: .5rem; }
    h1 { font-size: 1.35rem; margin: 0 0 .4rem; }
    .lead { color: var(--fo-muted); margin: 0 0 1.25rem; }
    .form { display: grid; gap: 1rem; }
    .err { color: var(--p-red-600); font-size: .82rem; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-top: .5rem; }
  `,
  template: `
    <div class="panel card">
      <i class="pi pi-lock icon"></i>
      <h1>{{ (forced() ? 'password.forcedTitle' : 'password.title') | translate }}</h1>
      <p class="lead">{{ (forced() ? 'password.forcedBody' : 'password.body') | translate: { name: auth.user()?.name ?? '' } }}</p>

      <form [formGroup]="form" (ngSubmit)="save()" class="form">
        <div class="field">
          <label for="cp-current">{{ (forced() ? 'password.temporary' : 'password.current') | translate }}</label>
          <p-password inputId="cp-current" formControlName="current" [feedback]="false" [toggleMask]="true" [fluid]="true" autocomplete="current-password" />
        </div>
        <div class="field">
          <label for="cp-new">{{ 'password.new' | translate }}</label>
          <p-password inputId="cp-new" formControlName="next" [feedback]="false" [toggleMask]="true" [fluid]="true" autocomplete="new-password" />
          <small class="hint">{{ 'password.rule' | translate }}</small>
        </div>
        <div class="field">
          <label for="cp-confirm">{{ 'password.confirm' | translate }}</label>
          <p-password inputId="cp-confirm" formControlName="confirm" [feedback]="false" [toggleMask]="true" [fluid]="true" autocomplete="new-password" />
          @if (form.controls.confirm.touched && form.controls.confirm.hasError('mismatch')) {
            <small class="err">{{ 'password.mismatch' | translate }}</small>
          }
        </div>
        <p-button type="submit" [label]="'password.save' | translate" [loading]="saving()" [disabled]="form.invalid" [fluid]="true" />
      </form>

      <div class="row">
        @if (forced()) {
          <p-button [label]="'shell.logout' | translate" icon="pi pi-sign-out" [text]="true" severity="secondary" size="small" (onClick)="auth.logout()" />
        } @else {
          <a routerLink="/"><p-button [label]="'common.cancel' | translate" [text]="true" severity="secondary" size="small" /></a>
        }
        <p-button [label]="lang.current() === 'ar' ? 'English' : 'العربية'" [text]="true" size="small" (onClick)="lang.toggle()" />
      </div>
    </div>
  `,
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
