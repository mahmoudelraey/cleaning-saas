import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { PlanFeatureKey } from '../plan-features';
import { TenantService } from '../tenant.service';
import { UpgradeService } from '../upgrade.service';

/**
 * UX only (the API refuses with feature_not_in_plan anyway): a page outside the company's plan sends
 * the user to the dashboard and opens the upgrade dialog for that feature.
 */
export const featureGuard =
  (feature: PlanFeatureKey): CanActivateFn =>
  () => {
    const tenants = inject(TenantService);
    const upgrade = inject(UpgradeService);
    const router = inject(Router);
    return tenants.ensureLoaded().pipe(
      map(() => {
        if (tenants.has(feature)) {
          return true;
        }
        upgrade.prompt(feature);
        return router.createUrlTree(['/dashboard']);
      }),
      catchError(() => of(true)),
    );
  };
