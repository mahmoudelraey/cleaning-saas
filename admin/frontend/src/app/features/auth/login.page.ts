import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';

import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Button, InputText, Password, Message],
  styleUrl: './auth-layout.scss',
  template: `
    <section class="hero">
      <p-button
        class="lang"
        [label]="lang.current() === 'ar' ? 'English' : 'العربية'"
        [text]="true"
        (onClick)="lang.toggle()"
      />
      <div>
        <h2>{{ 'auth.heroTitle' | translate }}</h2>
        <ul>
          <li><i class="pi pi-calendar"></i>{{ 'auth.heroPoint1' | translate }}</li>
          <li><i class="pi pi-whatsapp"></i>{{ 'auth.heroPoint2' | translate }}</li>
          <li><i class="pi pi-file"></i>{{ 'auth.heroPoint3' | translate }}</li>
        </ul>
      </div>
      <small>© FieldOps</small>
    </section>

    <section class="form-side">
      <div class="card">
        <h1>{{ 'auth.loginTitle' | translate }}</h1>
        <p>{{ 'auth.loginSubtitle' | translate }}</p>

        @if (error()) {
          <p-message severity="error">{{ error() }}</p-message>
        }

        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="field">
            <label for="identifier">{{ 'auth.identifier' | translate }}</label>
            <input
              pInputText
              id="identifier"
              formControlName="identifier"
              autocomplete="username"
              dir="ltr"
              [placeholder]="'05XXXXXXXX'"
            />
          </div>
          <div class="field">
            <label for="password">{{ 'auth.password' | translate }}</label>
            <p-password
              inputId="password"
              formControlName="password"
              [feedback]="false"
              [toggleMask]="true"
              autocomplete="current-password"
              [fluid]="true"
            />
          </div>
          <p-button
            type="submit"
            [label]="'auth.login' | translate"
            [loading]="loading()"
            [disabled]="form.invalid"
            [fluid]="true"
          />
        </form>

        <div class="switch">
          {{ 'auth.noAccount' | translate }}
          <a routerLink="/signup">{{ 'auth.startTrial' | translate }}</a>
        </div>
      </div>
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
