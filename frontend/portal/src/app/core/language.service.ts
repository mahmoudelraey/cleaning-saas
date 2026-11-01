import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Observable, tap } from 'rxjs';

export type Lang = 'ar' | 'en';
const KEY = 'pt.lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly doc = inject(DOCUMENT);
  readonly current = signal<Lang>('ar');

  init(): Observable<unknown> {
    let saved: Lang = 'ar';
    try {
      saved = localStorage.getItem(KEY) === 'en' ? 'en' : 'ar';
    } catch {
      // default Arabic
    }
    return this.use(saved);
  }

  toggle(): void {
    this.use(this.current() === 'ar' ? 'en' : 'ar').subscribe();
  }

  private use(lang: Lang): Observable<unknown> {
    return this.translate.use(lang).pipe(
      tap(() => {
        this.current.set(lang);
        this.doc.documentElement.lang = lang;
        this.doc.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        try {
          localStorage.setItem(KEY, lang);
        } catch {
          // ignore
        }
      }),
    );
  }
}
