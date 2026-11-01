import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';

import { AuthService } from '../../core/auth/auth.service';
import { errorMessage, fieldErrors } from '../../core/http/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { SAUDI_MOBILE_PATTERN } from '../../shared/format';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/;

@Component({
  selector: 'app-signup',
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
        <h2>{{ 'auth.signupHero' | translate }}</h2>
        <ul>
          <li><i class="pi pi-check-circle"></i>{{ 'auth.signupPoint1' | translate }}</li>
          <li><i class="pi pi-check-circle"></i>{{ 'auth.signupPoint2' | translate }}</li>
          <li><i class="pi pi-check-circle"></i>{{ 'auth.signupPoint3' | translate }}</li>
        </ul>
      </div>
      <small>© FieldOps</small>
    </section>

    <section class="form-side">
      <div class="card">
        <h1>{{ 'auth.signupTitle' | translate }}</h1>
        <p>{{ 'auth.signupSubtitle' | translate }}</p>

        @if (error()) {
          <p-message severity="error">{{ error() }}</p-message>
        }

        <form [formGroup]="form" (ngSubmit)="submit()">
          <div class="field">
            <label for="companyName">{{ 'auth.companyName' | translate }}</label>
            <input pInputText id="companyName" formControlName="companyName" />
          </div>

          <div class="field">
            <label for="slug">{{ 'auth.slug' | translate }}</label>
            <div class="slug-input">
              <input
                pInputText
                id="slug"
                formControlName="slug"
                placeholder="clean-co"
                autocapitalize="off"
                (input)="lowercaseSlug()"
              />
              <span>/book</span>
            </div>
            @if (form.controls.slug.touched && form.controls.slug.invalid) {
              <small class="error">{{ 'auth.slugRule' | translate }}</small>
            } @else {
              <small class="hint">{{ 'auth.slugHint' | translate }}</small>
            }
          </div>

          <div class="field">
            <label for="ownerName">{{ 'auth.ownerName' | translate }}</label>
            <input pInputText id="ownerName" formControlName="ownerName" autocomplete="name" />
          </div>

          <div class="field">
            <label for="phone">{{ 'auth.phone' | translate }}</label>
            <input pInputText id="phone" formControlName="phone" dir="ltr" placeholder="05XXXXXXXX" autocomplete="tel" />
            @if (serverFields()['phone'] || (form.controls.phone.touched && form.controls.phone.invalid)) {
              <small class="error">{{ 'errors.invalid_phone' | translate }}</small>
            }
          </div>

          <div class="field">
            <label for="email">{{ 'auth.emailOptional' | translate }}</label>
            <input pInputText id="email" type="email" formControlName="email" dir="ltr" autocomplete="email" />
          </div>

          <div class="field">
            <label for="password">{{ 'auth.password' | translate }}</label>
            <p-password
              inputId="password"
              formControlName="password"
              [toggleMask]="true"
              [feedback]="false"
              autocomplete="new-password"
              [fluid]="true"
            />
            <small class="hint">{{ 'auth.passwordRule' | translate }}</small>
          </div>

          <p-button
            type="submit"
            [label]="'auth.createAccount' | translate"
            [loading]="loading()"
            [disabled]="form.invalid"
            [fluid]="true"
          />
        </form>

        <div class="switch">
          {{ 'auth.haveAccount' | translate }}
          <a routerLink="/login">{{ 'auth.login' | translate }}</a>
        </div>
      </div>
    </section>
  `,
})
export class SignupPage {
  protected readonly lang = inject(LanguageService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverFields = signal<Record<string, string>>({});

  protected readonly form = inject(FormBuilder).nonNullable.group({
    companyName: ['', [Validators.required, Validators.maxLength(150)]],
    slug: ['', [Validators.required, Validators.pattern(SLUG_PATTERN)]],
    ownerName: ['', [Validators.required, Validators.maxLength(150)]],
    phone: ['', [Validators.required, Validators.pattern(SAUDI_MOBILE_PATTERN)]],
    email: ['', [Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  lowercaseSlug(): void {
    const c = this.form.controls.slug;
    const v = c.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (v !== c.value) {
      c.setValue(v);
    }
  }

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    this.auth.signup({ ...v, email: v.email || undefined }).subscribe({
      next: () => void this.router.navigateByUrl('/dashboard'),
      error: (err) => {
        this.error.set(errorMessage(err, this.translate));
        this.serverFields.set(fieldErrors(err));
        this.loading.set(false);
      },
    });
  }
}
