import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';

import { AuthService } from '../../core/auth/auth.service';
import { PlanFeatureKey } from '../../core/plan-features';
import { UpgradeService } from '../../core/upgrade.service';

/** Placeholder shown instead of a feature the company's plan doesn't include. Only owners can upgrade. */
@Component({
  selector: 'app-locked-feature',
  imports: [TranslatePipe, Button],
  styleUrl: './locked-feature.scss',
  templateUrl: './locked-feature.html',
})
export class LockedFeature {
  readonly feature = input.required<PlanFeatureKey>();
  protected readonly upgrade = inject(UpgradeService);
  protected readonly isOwner = inject(AuthService).hasRole('OWNER');
}
