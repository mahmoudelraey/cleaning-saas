import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { SessionService } from './session.service';

const PORTAL_URL = /^\/api\/portal\/([^/?]+)/;

/** Adds the company's customer token, and sends the visitor back to sign-in when it stops working. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const sessions = inject(SessionService);
  const router = inject(Router);
  const m = PORTAL_URL.exec(req.url);
  const slug = m ? decodeURIComponent(m[1]) : null;
  const session = slug ? sessions.get(slug) : null;
  const authed = session ? req.clone({ setHeaders: { Authorization: `Bearer ${session.token}` } }) : req;

  return next(authed).pipe(
    catchError((err: unknown) => {
      if (slug && session && err instanceof HttpErrorResponse) {
        const code = (err.error as { code?: string } | null)?.code;
        if (err.status === 401 || code === 'wrong_company') {
          sessions.clear(slug);
          void router.navigate(['/', slug, 'login']);
        } else if (code === 'profile_required') {
          void router.navigate(['/', slug, 'login'], { queryParams: { step: 'name' } });
        }
      }
      return throwError(() => err);
    }),
  );
};
