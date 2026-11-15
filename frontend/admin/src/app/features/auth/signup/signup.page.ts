import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';

import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage, fieldErrors } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { BrandLogo } from '../../../shared/brand-logo/brand-logo';
import { AuthHero } from '../auth-hero/auth-hero';
import { SAUDI_MOBILE_PATTERN } from '../../../shared/format';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/;

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Button, InputText, Password, Message, BrandLogo, AuthHero],
  styleUrls: ['../auth-layout.scss', './signup.page.scss'],
  templateUrl: './signup.page.html',
})
export class SignupPage {
  protected readonly lang = inject(LanguageService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly loading = signal(false);
  protected readonly year = new Date().getFullYear();
  protected readonly error = signal<string | null>(null);
  protected readonly serverFields = signal<Record<string, string>>({});

  protected readonly form = inject(FormBuilder).nonNullable.group({
    companyName: ['', [Validators.required, Validators.maxLength(150)]],
    companyNameEn: ['', [Validators.required, Validators.maxLength(150)]],
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
