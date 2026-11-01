import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';

import { ApiProblem } from '../api.types';

/** Turns an API error into a user-facing message using the stable `code` from problem+json. */
export function errorMessage(err: unknown, t: TranslateService): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return t.instant('errors.network');
    }
    const problem = err.error as ApiProblem | null;
    const code = problem?.code;
    if (code) {
      const key = `errors.${code}`;
      const translated = t.instant(key);
      if (translated !== key) {
        return translated;
      }
    }
    if (err.status === 403) {
      return t.instant('errors.forbidden');
    }
    if (problem?.detail) {
      return problem.detail;
    }
  }
  return t.instant('errors.generic');
}

/** Field-level validation messages from a 400 `validation_failed` problem. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof HttpErrorResponse && err.error && typeof err.error === 'object') {
    return (err.error as ApiProblem).fields ?? {};
  }
  return {};
}
