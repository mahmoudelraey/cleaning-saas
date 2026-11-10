import { Injectable, computed, inject, signal } from '@angular/core';

import { Company } from './api.types';
import { LanguageService } from './language.service';

/** The company of the current portal link, loaded once by the shell. */
@Injectable({ providedIn: 'root' })
export class CompanyStore {
  private readonly lang = inject(LanguageService);

  readonly company = signal<Company | null>(null);
  readonly slug = signal('');
  /** The company's name in the visitor's language (Arabic when it has no English name). */
  readonly name = computed(() => {
    const c = this.company();
    return (this.lang.current() === 'en' && c?.nameEn) || c?.name || '';
  });
}
