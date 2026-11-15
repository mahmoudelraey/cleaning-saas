import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageService } from '../../../core/i18n/language.service';

/** The teal side panel of the sign-in and sign-up pages: language switch, headline, illustration, three strengths. */
@Component({
  selector: 'app-auth-hero',
  imports: [TranslatePipe],
  styleUrl: './auth-hero.scss',
  templateUrl: './auth-hero.html',
})
export class AuthHero {
  protected readonly lang = inject(LanguageService);
  readonly titleKey = input.required<string>();
  readonly subtitleKey = input.required<string>();
}
