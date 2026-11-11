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
  /** The page's headline and "about us" in the visitor's language (Arabic when there is no English text). */
  readonly headline = computed(() => {
    const p = this.company()?.page;
    return (this.lang.current() === 'en' && p?.headlineEn) || p?.headline || '';
  });
  readonly about = computed(() => {
    const p = this.company()?.page;
    return (this.lang.current() === 'en' && p?.aboutEn) || p?.about || '';
  });
  /** Promises (one per line), service areas, working hours and address in the visitor's language. */
  readonly promises = computed(() => {
    const p = this.company()?.page;
    return (this.lang.current() === 'en' && p?.promisesEn) || p?.promises || '';
  });
  readonly areas = computed(() => {
    const p = this.company()?.page;
    return (this.lang.current() === 'en' && p?.areasEn) || p?.areas || '';
  });
  readonly hours = computed(() => {
    const p = this.company()?.page;
    return (this.lang.current() === 'en' && p?.hoursEn) || p?.hours || '';
  });
  readonly address = computed(() => {
    const c = this.company();
    return (this.lang.current() === 'en' && c?.addressEn) || c?.address || '';
  });
}
