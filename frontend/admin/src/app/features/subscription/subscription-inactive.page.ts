import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { Tag } from 'primeng/tag';

import { AuthService } from '../../core/auth/auth.service';
import { TenantService } from '../../core/tenant.service';
import { LocalDatePipe } from '../../shared/local-date.pipe';

/** Shown when the API answers `subscription_inactive`. The server decides; this page only explains. */
@Component({
  selector: 'app-subscription-inactive',
  imports: [TranslatePipe, Button, Tag, LocalDatePipe],
  styles: `
    :host { display: grid; place-items: center; min-height: 100vh; padding: 1.25rem; }
    .card { max-width: 520px; width: 100%; text-align: center; }
    .icon { font-size: 2.5rem; color: var(--p-orange-500); margin-bottom: .75rem; display: block; }
    h1 { font-size: 1.4rem; margin: 0 0 .75rem; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: .5rem 1rem; text-align: start;
         margin: 1.25rem auto; max-width: 320px; }
    dt { color: var(--fo-muted); }
    dd { margin: 0; }
    .actions { display: flex; gap: .5rem; justify-content: center; margin-top: 1.25rem; flex-wrap: wrap; }
  `,
  template: `
    <div class="panel card">
      <i class="pi pi-lock icon"></i>
      <h1>{{ 'subscription.title' | translate }}</h1>
      <p class="muted">{{ 'subscription.body' | translate: { company: tenants.tenant()?.name ?? '' } }}</p>

      @if (tenants.tenant(); as t) {
        <dl>
          <dt>{{ 'subscription.status' | translate }}</dt>
          <dd><p-tag severity="warn" [value]="'settings.status.' + t.status | translate" /></dd>
          @if (t.trialEndsAt) {
            <dt>{{ 'subscription.endedAt' | translate }}</dt>
            <dd>{{ t.trialEndsAt | ldate: 'medium' }}</dd>
          }
        </dl>
      }

      <p>{{ 'subscription.next' | translate }}</p>

      <div class="actions">
        <p-button icon="pi pi-refresh" [label]="'subscription.retry' | translate" [outlined]="true" (onClick)="retry()" />
        <p-button icon="pi pi-sign-out" [label]="'subscription.logout' | translate" severity="secondary" [text]="true" (onClick)="auth.logout()" />
      </div>
    </div>
  `,
})
export class SubscriptionInactivePage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly tenants = inject(TenantService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    // GET /tenant stays allowed while inactive, so we can show status and dates.
    this.tenants.load().subscribe({ error: () => {} });
  }

  /** Re-checks with the server (e.g. after support activated the account). */
  retry(): void {
    void this.router.navigateByUrl('/dashboard');
  }
}
