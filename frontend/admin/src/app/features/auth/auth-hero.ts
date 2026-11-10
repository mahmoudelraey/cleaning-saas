import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageService } from '../../core/i18n/language.service';

/** The teal side panel of the sign-in and sign-up pages: language switch, headline, illustration, three strengths. */
@Component({
  selector: 'app-auth-hero',
  imports: [TranslatePipe],
  styleUrl: './auth-hero.scss',
  template: `
    <button type="button" class="lang" (click)="lang.toggle()">
      <i class="pi pi-globe"></i>
      <span>{{ lang.current() === 'ar' ? 'English' : 'العربية' }}</span>
      <i class="pi pi-angle-down"></i>
    </button>

    <div class="copy">
      <h2>{{ titleKey() | translate }}</h2>
      <p>{{ subtitleKey() | translate }}</p>
    </div>

    <div class="art">
      <img src="brand/login-hero.webp" alt="" />
    </div>

    <ul class="strengths">
      <li><i class="pi pi-shield"></i><span>{{ 'auth.feature1' | translate }}</span></li>
      <li><i class="pi pi-bolt"></i><span>{{ 'auth.feature2' | translate }}</span></li>
      <li><i class="pi pi-chart-bar"></i><span>{{ 'auth.feature3' | translate }}</span></li>
    </ul>
  `,
})
export class AuthHero {
  protected readonly lang = inject(LanguageService);
  readonly titleKey = input.required<string>();
  readonly subtitleKey = input.required<string>();
}
