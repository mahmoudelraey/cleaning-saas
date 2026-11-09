import { DestroyRef, Signal, effect, inject, signal, untracked } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Observable, Subscription } from 'rxjs';

import { errorMessage } from '../../core/http/api-error';

export interface Load<T> {
  state: 'loading' | 'ok' | 'error';
  data: T | null;
  error: string | null;
}

/**
 * A dashboard section that reloads whenever its inputs change: keeps the previous data visible while
 * refreshing, cancels a request that a newer one replaces, and turns failures into a translated message.
 * Must be called in an injection context.
 */
export function loader<K, T>(key: Signal<K | null>, fetch: (k: K) => Observable<T>): { value: Signal<Load<T>>; reload: () => void } {
  const translate = inject(TranslateService);
  const value = signal<Load<T>>({ state: 'loading', data: null, error: null });
  let sub: Subscription | null = null;
  inject(DestroyRef).onDestroy(() => sub?.unsubscribe());

  const run = (k: K) => {
    sub?.unsubscribe();
    value.update((v) => ({ state: 'loading', data: v.data, error: null }));
    sub = fetch(k).subscribe({
      next: (data) => value.set({ state: 'ok', data, error: null }),
      error: (e) => value.set({ state: 'error', data: null, error: errorMessage(e, translate) }),
    });
  };

  effect(() => {
    const k = key();
    if (k !== null) untracked(() => run(k));
  });

  return {
    value,
    reload: () => {
      const k = untracked(key);
      if (k !== null) run(k);
    },
  };
}
