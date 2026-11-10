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
  styles: `
    .wrap { max-width: 460px; margin: clamp(24px, 6vh, 64px) auto 0; padding: 32px 28px 28px; background: var(--surface);
            border-radius: 28px; box-shadow: 0 24px 50px -32px rgba(15, 42, 61, .45); }
    @media (max-width: 520px) { .wrap { margin: 16px 12px 0; padding: 24px 18px; } }
    h1 { font-size: 1.7rem; font-weight: 700; margin-bottom: 8px; }
    .lead { color: var(--ink-2); margin: 0 0 22px; }
    .perks { list-style: none; padding: 0; margin: 0 0 24px; display: grid; gap: 8px; }
    .perks li { display: flex; gap: 10px; align-items: flex-start; color: var(--ink-2); font-size: .95rem; }
    .perks i { color: var(--tide); margin-top: 4px; }
    .phone { display: flex; align-items: stretch; direction: ltr; }
    .phone .cc { display: grid; place-items: center; padding: 0 14px; background: var(--foam); color: var(--tide-deep);
                 font-weight: 700; border-radius: var(--r-md) 0 0 var(--r-md); }
    .phone .input { border-radius: 0 var(--r-md) var(--r-md) 0; font-size: 1.15rem; letter-spacing: .04em; }
    .opt { color: var(--ink-3); font-weight: 400; font-size: .85rem; }
    .code { text-align: center; font-size: 1.8rem; font-weight: 700; letter-spacing: .5em; direction: ltr; padding-inline-start: .5em; }
    .sent { color: var(--ink-2); margin: 0 0 20px; }
    .sent strong { color: var(--ink); }
    .meta { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: .9rem; }
    .err { color: var(--rose); font-size: .9rem; margin: -6px 0 14px; }
    .dev { background: var(--sun-soft); color: #8a5a07; padding: 8px 12px; border-radius: var(--r-sm); font-size: .85rem; margin-bottom: 14px; }
    .switch { text-align: center; margin-top: 22px; color: var(--ink-2); font-size: .95rem; }
  `,
  template: `
    <div class="wrap">
      @if (step() === 'details') {
        <h1>{{ 'register.title' | translate }}</h1>
        <p class="lead">{{ 'register.lead' | translate: { company: store.name() } }}</p>
        <ul class="perks">
          <li><i class="pi pi-calendar-plus"></i>{{ 'register.perk1' | translate }}</li>
          <li><i class="pi pi-map"></i>{{ 'register.perk2' | translate }}</li>
          <li><i class="pi pi-receipt"></i>{{ 'register.perk3' | translate }}</li>
        </ul>
        <form (ngSubmit)="sendCode()">
          <div class="field">
            <label for="rg-name">{{ 'register.name' | translate }}</label>
            <input id="rg-name" class="input" name="name" [(ngModel)]="name" autocomplete="name" maxlength="150" required />
          </div>
          <div class="field">
            <label for="rg-ph">{{ 'login.phone' | translate }}</label>
            <div class="phone">
              <span class="cc">+966</span>
              <input id="rg-ph" class="input" name="phone" [(ngModel)]="phone" inputmode="tel" autocomplete="tel-national"
                     placeholder="05XXXXXXXX" maxlength="14" required />
            </div>
          </div>
          <div class="field">
            <label for="rg-em">{{ 'register.email' | translate }} <span class="opt">{{ 'register.optional' | translate }}</span></label>
            <input id="rg-em" class="input ltr" style="display:block; width:100%" name="email" type="email" [(ngModel)]="email"
                   autocomplete="email" maxlength="200" />
          </div>
          @if (error()) { <p class="err">{{ error() }}</p> }
          <button class="btn btn-primary btn-block" [disabled]="busy()">{{ 'register.create' | translate }}</button>
        </form>
        <p class="switch">{{ 'register.haveAccount' | translate }}
          <a [routerLink]="['/', store.slug(), 'login']" [queryParams]="next() ? { next: next() } : {}">{{ 'company.signIn' | translate }}</a>
        </p>
      } @else {
        <h1>{{ 'login.codeTitle' | translate }}</h1>
        <p class="sent">{{ 'login.sentTo' | translate }} <strong class="ltr">{{ phone }}</strong></p>
        @if (devCode()) { <div class="dev">{{ 'login.devCode' | translate }} <strong class="ltr">{{ devCode() }}</strong></div> }
        <form (ngSubmit)="verify()">
          <div class="field">
            <label for="rg-cd">{{ 'login.code' | translate }}</label>
            <input id="rg-cd" class="input code tnum" name="code" [(ngModel)]="code" inputmode="numeric"
                   autocomplete="one-time-code" maxlength="6" (ngModelChange)="onCode()" required />
          </div>
          @if (error()) { <p class="err">{{ error() }}</p> }
          <button class="btn btn-primary btn-block" [disabled]="busy() || code.length !== 6">{{ 'login.verify' | translate }}</button>
        </form>
        <div class="meta">
          <button type="button" class="link-btn" (click)="step.set('details'); error.set(null)">{{ 'register.back' | translate }}</button>
          @if (resendIn() > 0) {
            <span class="muted">{{ 'login.resendIn' | translate: { s: resendIn() } }}</span>
          } @else {
            <button type="button" class="link-btn" (click)="sendCode()">{{ 'login.resend' | translate }}</button>
          }
        </div>
      }
    </div>
  `,
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
