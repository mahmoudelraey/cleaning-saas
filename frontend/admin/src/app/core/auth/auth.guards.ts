import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Role, Screen } from '../api.types';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { next: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/']) : true;
};

/** UX only: the API enforces roles with @PreAuthorize regardless of what the UI shows. */
export const roleGuard =
  (...roles: Role[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    return auth.hasRole(...roles) ? true : inject(Router).createUrlTree(['/']);
  };

/** Coordinators need one of these screens (set per person on the Team page); other roles are not limited here. */
export const screenGuard =
  (...anyOf: Screen[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    if (!auth.hasRole('COORDINATOR') || auth.canSee(...anyOf)) return true;
    return inject(Router).createUrlTree([auth.homePath()]);
  };

/** Users with a temporary password (set by the owner) must choose their own before anything else. */
export const passwordChangedGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.mustChangePassword() ? inject(Router).createUrlTree(['/change-password']) : true;
};
