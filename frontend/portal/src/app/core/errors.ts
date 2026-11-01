import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';

/** Server errors carry a stable code; the text comes from errors.<code>, else a sensible fallback. */
export function errorMessage(err: unknown, t: TranslateService): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return t.instant('errors.network');
    }
    const code = (err.error as { code?: string } | null)?.code;
    if (code) {
      const key = `errors.${code}`;
      const text = t.instant(key);
      if (text !== key) {
        return text;
      }
    }
    if (err.status === 429) {
      return t.instant('errors.rate_limited');
    }
  }
  return t.instant('errors.generic');
}
