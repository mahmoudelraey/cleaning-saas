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
  styleUrl: './login.page.scss',
  templateUrl: './login.page.html',
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
