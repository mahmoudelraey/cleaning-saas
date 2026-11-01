import { Injectable, signal } from '@angular/core';

import { PlanFeatureKey } from './plan-features';

/** Opens the plans dialog (hosted by the shell) from anywhere, optionally for a specific locked feature. */
@Injectable({ providedIn: 'root' })
export class UpgradeService {
  readonly open = signal(false);
  readonly feature = signal<PlanFeatureKey | null>(null);

  prompt(feature?: PlanFeatureKey): void {
    this.feature.set(feature ?? null);
    this.open.set(true);
  }
}
