import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { InputGroup } from 'primeng/inputgroup';
import { InputGroupAddon } from 'primeng/inputgroupaddon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';

import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { BrandLogo } from '../../shared/brand-logo';
import { AuthHero } from './auth-hero';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Button, InputText, InputGroup, InputGroupAddon, Password, Message, BrandLogo, AuthHero],
  styleUrl: './auth-layout.scss',
  template: `
    <app-auth-hero titleKey="auth.heroTitle" subtitleKey="auth.heroSubtitle" />

    <section class="form-side">
      <div class="form-wrap">
        <app-brand-logo class="logo" [size]="72" />
        <h1>{{ 'auth.loginTitle' | translate }}</h1>
        <p class="sub">{{ 'auth.loginSubtitle' | translate }}</p>

        <div class="card">
          @if (error()) {
            <p-message severity="error">{{ error() }}</p-message>
          }

          <form [formGroup]="form" (ngSubmit)="submit()">
            <div class="field">
              <label for="identifier">{{ 'auth.identifier' | translate }}</label>
              <p-inputgroup>
                <p-inputgroup-addon><i class="pi pi-phone"></i></p-inputgroup-addon>
                <input
                  pInputText
                  id="identifier"
                  formControlName="identifier"
                  autocomplete="username"
                  dir="ltr"
                  [placeholder]="'05XXXXXXXX'"
                />
              </p-inputgroup>
            </div>
            <div class="field">
              <label for="password">{{ 'auth.password' | translate }}</label>
              <p-inputgroup>
                <p-inputgroup-addon><i class="pi pi-lock"></i></p-inputgroup-addon>
                <p-password
                  inputId="password"
                  formControlName="password"
                  [feedback]="false"
                  [toggleMask]="true"
                  autocomplete="current-password"
                  [fluid]="true"
                />
              </p-inputgroup>
            </div>

            <button type="button" class="forgot" (click)="showForgot.set(!showForgot())">
              {{ 'auth.forgotPassword' | translate }}
            </button>
            @if (showForgot()) {
              <p-message severity="info" size="small">{{ 'auth.forgotHint' | translate }}</p-message>
            }

            <p-button
              class="submit"
              type="submit"
              icon="pi pi-sign-in"
              [label]="'auth.login' | translate"
              [loading]="loading()"
              [disabled]="form.invalid"
              [fluid]="true"
            />
          </form>

          <div class="or">{{ 'auth.or' | translate }}</div>
          <div class="switch">
            {{ 'auth.noAccount' | translate }}
            <a routerLink="/signup">{{ 'auth.startTrial' | translate }}</a>
          </div>
        </div>
      </div>

      <footer class="auth-footer">
        <span dir="ltr">FieldOps © {{ year }}</span><span class="sep">|</span>{{ 'auth.footerTagline' | translate }}
      </footer>
    </section>
  `,
})
export class LoginPage {
  protected readonly lang = inject(LanguageService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  /** Bound from ?next= by withComponentInputBinding. */
  readonly next = input<string>();

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showForgot = signal(false);
  protected readonly year = new Date().getFullYear();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    identifier: ['', [Validators.required, Validators.maxLength(200)]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { identifier, password } = this.form.getRawValue();
    this.auth.login(identifier, password).subscribe({
      next: () => {
        const next = this.next();
        void this.router.navigateByUrl(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
      },
      error: (err) => {
        this.error.set(errorMessage(err, this.translate));
        this.loading.set(false);
      },
    });
  }
}
