import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { Tag } from 'primeng/tag';

import { AuthService } from '../../../core/auth/auth.service';
import { TenantService } from '../../../core/tenant.service';
import { LocalDatePipe } from '../../../shared/local-date.pipe';

/** Shown when the API answers `subscription_inactive`. The server decides; this page only explains. */
@Component({
  selector: 'app-subscription-inactive',
  imports: [TranslatePipe, Button, Tag, LocalDatePipe],
  styleUrl: './subscription-inactive.page.scss',
  templateUrl: './subscription-inactive.page.html',
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
