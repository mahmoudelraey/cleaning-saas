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

import { AuthService } from '../../../core/auth/auth.service';
import { errorMessage } from '../../../core/http/api-error';
import { LanguageService } from '../../../core/i18n/language.service';
import { BrandLogo } from '../../../shared/brand-logo/brand-logo';
import { AuthHero } from '../auth-hero/auth-hero';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Button, InputText, InputGroup, InputGroupAddon, Password, Message, BrandLogo, AuthHero],
  styleUrl: '../auth-layout.scss',
  templateUrl: './login.page.html',
})
export class LoginPage {
  protected readonly lang = inject(LanguageService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  /** Bound from ?next= by withComponentInputBinding. */
  readonly next = input<string>();
  /** ?reason=idle: signed out after a period without activity. */
  readonly reason = input<string>();

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
