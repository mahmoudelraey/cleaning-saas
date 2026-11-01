import { Injectable, signal } from '@angular/core';

import { Company } from './api.types';

/** The company of the current portal link, loaded once by the shell. */
@Injectable({ providedIn: 'root' })
export class CompanyStore {
  readonly company = signal<Company | null>(null);
  readonly slug = signal('');
}
