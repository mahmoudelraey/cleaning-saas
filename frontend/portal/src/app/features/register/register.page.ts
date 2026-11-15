import { Component, OnDestroy, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable, of, switchMap } from 'rxjs';

import { Session } from '../../core/api.types';
import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { SAUDI_MOBILE } from '../../core/format';
import { PortalApi } from '../../core/portal.api';
import { SessionService } from '../../core/session.service';
import { ToastService } from '../../core/toast';

type Step = 'details' | 'code';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create an account: name, mobile (and optional email), then the one-time code. If the mobile already has an
 * account with this company, the code simply signs them in.
 */
@Component({
  selector: 'pt-register',
  imports: [FormsModule, RouterLink, TranslatePipe],
  styleUrl: './register.page.scss',
  templateUrl: './register.page.html',
})
export class RegisterPage implements OnDestroy {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly toasts = inject(ToastService);

  /** From the URL: where to go once the account exists. */
  readonly next = input<string>();

  protected readonly step = signal<Step>('details');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resendIn = signal(0);
  protected readonly devCode = signal<string | null>(null);
  protected name = '';
  protected phone = '';
  protected email = '';
  protected code = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  private get slug(): string {
    return this.route.parent?.snapshot.paramMap.get('slug') ?? '';
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  sendCode(): void {
    const raw = this.phone.replace(/[\s-]/g, '');
    if (!this.name.trim()) {
      this.error.set(this.translate.instant('register.nameRequired'));
      return;
    }
    if (!SAUDI_MOBILE.test(raw)) {
      this.error.set(this.translate.instant('errors.invalid_phone'));
      return;
    }
    if (this.email.trim() && !EMAIL.test(this.email.trim())) {
      this.error.set(this.translate.instant('register.badEmail'));
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.sendCode(this.slug, raw).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.devCode.set(r.devCode ?? null);
        this.code = '';
        this.step.set('code');
        this.countdown(r.resendAfterSeconds);
      },
      error: (e) => this.fail(e),
    });
  }

  onCode(): void {
    this.code = this.code.replace(/\D/g, '').slice(0, 6);
    if (this.code.length === 6 && !this.busy()) this.verify();
  }

  verify(): void {
    const slug = this.slug;
    const name = this.name.trim();
    const email = this.email.trim() || null;
    this.busy.set(true);
    this.error.set(null);
    let existing = false;
    this.api
      .verify(slug, this.phone.replace(/[\s-]/g, ''), this.code)
      .pipe(
        switchMap((s): Observable<Session> => {
          this.sessions.set(slug, s);
          if (s.needsName) return this.api.register(slug, name);
          existing = true; // this mobile already had an account: the code signed them in
          return of(s);
        }),
        switchMap((s) => {
          this.sessions.set(slug, s);
          // New accounts get the email they typed; existing ones keep their details.
          return !existing && email ? this.api.updateMe(slug, name, email).pipe(switchMap(() => of(s))) : of(s);
        }),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.toasts.show(this.translate.instant(existing ? 'register.welcomeBack' : 'register.created'));
          this.done();
        },
        error: (e) => this.fail(e),
      });
  }

  private done(): void {
    const next = this.next();
    const portal = `/${this.slug}`;
    const samePortal = !!next && (next === portal || next.startsWith(`${portal}/`) || next.startsWith(`${portal}?`));
    const safe = samePortal && !/\/(login|register)/.test(next) ? next : `${portal}/home`;
    void this.router.navigateByUrl(safe, { replaceUrl: true });
  }

  private fail(e: unknown): void {
    this.busy.set(false);
    this.error.set(errorMessage(e, this.translate));
  }

  private countdown(seconds: number): void {
    if (this.timer) clearInterval(this.timer);
    this.resendIn.set(seconds);
    this.timer = setInterval(() => {
      this.resendIn.update((v) => Math.max(0, v - 1));
      if (this.resendIn() === 0 && this.timer) clearInterval(this.timer);
    }, 1000);
  }
}
