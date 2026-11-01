import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';

import { AuthService } from '../core/auth/auth.service';
import { PlanFeatureKey } from '../core/plan-features';
import { UpgradeService } from '../core/upgrade.service';

/** Placeholder shown instead of a feature the company's plan doesn't include. Only owners can upgrade. */
@Component({
  selector: 'app-locked-feature',
  imports: [TranslatePipe, Button],
  styles: `
    :host { display: block; }
    .box { border: 1.5px dashed var(--fo-border); border-radius: 12px; padding: 1.25rem 1rem; text-align: center;
           display: flex; flex-direction: column; align-items: center; gap: .45rem;
           background: color-mix(in srgb, #f59e0b 4%, transparent); }
    .lock { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
            background: color-mix(in srgb, #f59e0b 14%, transparent); color: #b45309; }
    strong { font-size: .95rem; }
    p { margin: 0; color: var(--fo-muted); font-size: .84rem; max-width: 340px; }
    p-button { margin-top: .35rem; }
  `,
  template: `
    <div class="box">
      <span class="lock"><i class="pi pi-lock"></i></span>
      <strong>{{ 'upgrade.lockedTitle' | translate: { feature: ('upgrade.features.' + feature() | translate) } }}</strong>
      @if (isOwner) {
        <p>{{ 'upgrade.lockedOwner' | translate }}</p>
        <p-button icon="pi pi-bolt" [label]="'upgrade.upgradePlan' | translate" size="small" (onClick)="upgrade.prompt(feature())" />
      } @else {
        <p>{{ 'upgrade.lockedStaff' | translate }}</p>
      }
    </div>
  `,
})
export class LockedFeature {
  readonly feature = input.required<PlanFeatureKey>();
  protected readonly upgrade = inject(UpgradeService);
  protected readonly isOwner = inject(AuthService).hasRole('OWNER');
}
