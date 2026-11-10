import { Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { CompanyStore } from '../../core/company.store';
import { errorMessage } from '../../core/errors';
import { PortalApi } from '../../core/portal.api';
import { SessionService } from '../../core/session.service';
import { SAUDI_MOBILE } from '../../core/format';

type Step = 'phone' | 'code' | 'name';

/** Mobile + one-time code (WhatsApp, SMS fallback). First-time customers then give their name. */
@Component({
  selector: 'pt-login',
  imports: [FormsModule, RouterLink, TranslatePipe],
  styles: `
    .wrap { max-width: 460px; margin: clamp(24px, 6vh, 64px) auto 0; padding: 32px 28px 28px; background: var(--surface);
            border-radius: 28px; box-shadow: 0 24px 50px -32px rgba(15, 42, 61, .45); }
    @media (max-width: 520px) { .wrap { margin: 16px 12px 0; padding: 24px 18px; } }
    h1 { font-size: 1.7rem; font-weight: 700; margin-bottom: 8px; }
    .lead { color: var(--ink-2); margin: 0 0 28px; }
    .phone { display: flex; align-items: stretch; direction: ltr; }
    .phone .cc { display: grid; place-items: center; padding: 0 14px; background: var(--foam); color: var(--tide-deep);
                 font-weight: 700; border-radius: var(--r-md) 0 0 var(--r-md); }
    .phone .input { border-radius: 0 var(--r-md) var(--r-md) 0; font-size: 1.15rem; letter-spacing: .04em; }
    .code { text-align: center; font-size: 1.8rem; font-weight: 700; letter-spacing: .5em; direction: ltr; padding-inline-start: .5em; }
    .sent { color: var(--ink-2); margin: 0 0 20px; }
    .sent strong { color: var(--ink); }
    .meta { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: .9rem; }
    .err { color: var(--rose); font-size: .9rem; margin: -6px 0 14px; }
    .switch { text-align: center; margin-top: 22px; color: var(--ink-2); font-size: .95rem; }
    .dev { background: var(--sun-soft); color: #8a5a07; padding: 8px 12px; border-radius: var(--r-sm); font-size: .85rem; margin-bottom: 14px; }
  `,
  template: `
    <div class="wrap">
      @switch (step()) {
        @case ('phone') {
          <h1>{{ 'login.title' | translate }}</h1>
          <p class="lead">{{ 'login.lead' | translate: { company: store.name() } }}</p>
          <form (ngSubmit)="sendCode()">
            <div class="field">
              <label for="ph">{{ 'login.phone' | translate }}</label>
              <div class="phone">
                <span class="cc">+966</span>
                <input id="ph" class="input" name="phone" [(ngModel)]="phone" inputmode="tel" autocomplete="tel-national"
                       placeholder="05XXXXXXXX" maxlength="14" required />
              </div>
            </div>
            @if (error()) { <p class="err">{{ error() }}</p> }
            <button class="btn btn-primary btn-block" [disabled]="busy()">{{ 'login.sendCode' | translate }}</button>
          </form>
          <p class="switch">{{ 'login.newHere' | translate }}
            <a [routerLink]="['/', store.slug(), 'register']" [queryParams]="next() ? { next: next() } : {}">{{ 'register.title' | translate }}</a>
          </p>
        }
        @case ('code') {
          <h1>{{ 'login.codeTitle' | translate }}</h1>
          <p class="sent">{{ 'login.sentTo' | translate }} <strong class="ltr">{{ phone }}</strong></p>
          @if (devCode()) { <div class="dev">{{ 'login.devCode' | translate }} <strong class="ltr">{{ devCode() }}</strong></div> }
          <form (ngSubmit)="verify()">
            <div class="field">
              <label for="cd">{{ 'login.code' | translate }}</label>
              <input id="cd" class="input code tnum" name="code" [(ngModel)]="code" inputmode="numeric"
                     autocomplete="one-time-code" maxlength="6" (ngModelChange)="onCode()" required />
            </div>
            @if (error()) { <p class="err">{{ error() }}</p> }
            <button class="btn btn-primary btn-block" [disabled]="busy() || code.length !== 6">{{ 'login.verify' | translate }}</button>
          </form>
          <div class="meta">
            <button type="button" class="link-btn" (click)="step.set('phone'); error.set(null)">{{ 'login.changePhone' | translate }}</button>
            @if (resendIn() > 0) {
              <span class="muted">{{ 'login.resendIn' | translate: { s: resendIn() } }}</span>
            } @else {
              <button type="button" class="link-btn" (click)="sendCode()">{{ 'login.resend' | translate }}</button>
            }
          </div>
        }
        @case ('name') {
          <h1>{{ 'login.nameTitle' | translate }}</h1>
          <p class="lead">{{ 'login.nameLead' | translate: { company: store.name() } }}</p>
          <form (ngSubmit)="saveName()">
            <div class="field">
              <label for="nm">{{ 'login.name' | translate }}</label>
              <input id="nm" class="input" name="name" [(ngModel)]="name" autocomplete="name" maxlength="150" required />
            </div>
            @if (error()) { <p class="err">{{ error() }}</p> }
            <button class="btn btn-primary btn-block" [disabled]="busy() || !name.trim()">{{ 'login.continue' | translate }}</button>
          </form>
        }
      }
    </div>
  `,
})
export class LoginPage implements OnInit, OnDestroy {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  /** From the URL (component input binding): where to go after signing in. */
  readonly next = input<string>();

  protected readonly step = signal<Step>('phone');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resendIn = signal(0);
  protected readonly devCode = signal<string | null>(null);
  protected phone = '';
  protected code = '';
  protected name = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  private get slug(): string {
    return this.route.parent?.snapshot.paramMap.get('slug') ?? '';
  }

  ngOnInit(): void {
    const s = this.sessions.get(this.slug);
    if (s && this.route.snapshot.queryParamMap.get('step') === 'name' && s.needsName) {
      this.step.set('name');
    } else if (s && !s.needsName) {
      this.done();
    }
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  sendCode(): void {
    const raw = this.phone.replace(/[\s-]/g, '');
    if (!SAUDI_MOBILE.test(raw)) {
      this.error.set(this.translate.instant('errors.invalid_phone'));
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
    if (this.code.length === 6 && !this.busy()) {
      this.verify();
    }
  }

  verify(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.verify(this.slug, this.phone.replace(/[\s-]/g, ''), this.code).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.sessions.set(this.slug, s);
        if (s.needsName) {
          this.step.set('name');
        } else {
          this.done();
        }
      },
      error: (e) => this.fail(e),
    });
  }

  saveName(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.register(this.slug, this.name.trim()).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.sessions.set(this.slug, s);
        this.done();
      },
      error: (e) => this.fail(e),
    });
  }

  private done(): void {
    const next = this.next();
    // Only same-portal paths, never an outside URL.
    const home = `/${this.slug}/home`;
    const portal = `/${this.slug}`;
    const samePortal = !!next && (next === portal || next.startsWith(`${portal}/`) || next.startsWith(`${portal}?`));
    const safe = samePortal && !next.includes('/login') ? next : home;
    void this.router.navigateByUrl(safe, { replaceUrl: true });
  }

  private fail(e: unknown): void {
    this.busy.set(false);
    this.error.set(errorMessage(e, this.translate));
  }

  private countdown(seconds: number): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.resendIn.set(seconds);
    this.timer = setInterval(() => {
      this.resendIn.update((v) => Math.max(0, v - 1));
      if (this.resendIn() === 0 && this.timer) {
        clearInterval(this.timer);
      }
    }, 1000);
  }
}
