import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SessionService } from './session.service';

/** Portal pages need a signed-in customer of this company (and a name, for first-time visitors). */
export const signedIn: CanActivateFn = (route, state) => {
  const slug = route.parent?.paramMap.get('slug') ?? route.paramMap.get('slug') ?? '';
  const s = inject(SessionService).get(slug);
  const router = inject(Router);
  if (!s) {
    return router.createUrlTree(['/', slug, 'login'], { queryParams: { next: state.url } });
  }
  if (s.needsName) {
    return router.createUrlTree(['/', slug, 'login'], { queryParams: { step: 'name', next: state.url } });
  }
  return true;
};
