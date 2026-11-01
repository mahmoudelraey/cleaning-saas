import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { LanguageService } from '../i18n/language.service';
import { AuthService } from './auth.service';

/** Endpoints that must never carry (or try to refresh) a bearer token. */
const ANONYMOUS = ['/api/v1/auth/login', '/api/v1/auth/signup', '/api/v1/auth/refresh', '/api/v1/auth/logout'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const lang = inject(LanguageService);
  const router = inject(Router);

  const anonymous = ANONYMOUS.some((p) => req.url.startsWith(p)) || req.url.startsWith('/api/v1/public/');
  const withHeaders = (r: HttpRequest<unknown>, token: string | null) =>
    r.clone({
      setHeaders: {
        'Accept-Language': lang.current(),
        ...(token && !anonymous ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  return next(withHeaders(req, auth.accessToken())).pipe(
    catchError((err: unknown) => {
      // Temporary password not replaced yet (e.g. reset by the owner while signed in).
      if (
        err instanceof HttpErrorResponse &&
        err.status === 403 &&
        (err.error as { code?: string } | null)?.code === 'password_change_required'
      ) {
        void router.navigate(['/change-password']);
        return throwError(() => err);
      }
      // The server decided the company's trial/subscription is over: show the explanation screen.
      if (
        err instanceof HttpErrorResponse &&
        err.status === 403 &&
        !anonymous &&
        (err.error as { code?: string } | null)?.code === 'subscription_inactive'
      ) {
        void router.navigate(['/subscription-inactive']);
        return throwError(() => err);
      }
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || anonymous || !auth.isLoggedIn()) {
        return throwError(() => err);
      }
      // Access token expired: refresh once, then replay the original request.
      return auth.refresh().pipe(
        switchMap((token) => next(withHeaders(req, token))),
        catchError((refreshErr: unknown) => {
          if (
            refreshErr instanceof HttpErrorResponse &&
            (refreshErr.error as { code?: string } | null)?.code === 'subscription_inactive'
          ) {
            void router.navigate(['/subscription-inactive']);
            return throwError(() => refreshErr);
          }
          auth.logout();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
