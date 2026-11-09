import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, fromEvent, interval, merge } from 'rxjs';

const EVERY_MS = 60_000;

/**
 * Reloads a page's data every minute and whenever the customer comes back to the tab, so a visit's status
 * (confirmed → technician assigned → on the way) updates without a manual reload. Same cadence as the bell.
 */
export function liveRefresh(destroyRef: DestroyRef, reload: () => void): void {
  const backToTab = fromEvent(document, 'visibilitychange').pipe(filter(() => document.visibilityState === 'visible'));
  const tick = interval(EVERY_MS).pipe(filter(() => document.visibilityState === 'visible'));
  merge(tick, backToTab).pipe(takeUntilDestroyed(destroyRef)).subscribe(() => reload());
}
