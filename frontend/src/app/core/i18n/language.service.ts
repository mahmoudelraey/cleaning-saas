import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNG } from 'primeng/config';
import { Observable, tap } from 'rxjs';

export type Lang = 'ar' | 'en';
const STORAGE_KEY = 'fieldops.lang';

/** Arabic-first: the whole layout flips via <html dir>, components use CSS logical properties. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);
  private readonly primeng = inject(PrimeNG);

  readonly current = signal<Lang>(readStored());

  init(): Observable<unknown> {
    return this.use(this.current());
  }

  toggle(): void {
    this.use(this.current() === 'ar' ? 'en' : 'ar').subscribe();
  }

  use(lang: Lang): Observable<unknown> {
    this.current.set(lang);
    const html = this.document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
    return this.translate.use(lang).pipe(
      tap(() => {
        const primeTexts = this.translate.instant('primeng');
        if (primeTexts && typeof primeTexts === 'object') {
          this.primeng.setTranslation(primeTexts);
        }
      }),
    );
  }
}

function readStored(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}
