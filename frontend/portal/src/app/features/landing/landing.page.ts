import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Opened without a company link: explain where the right link comes from. */
@Component({
  selector: 'pt-landing',
  imports: [TranslatePipe],
  styles: `
    .wrap { max-width: 440px; margin: 20vh auto 0; padding: 0 16px; text-align: center; }
    i { font-size: 2rem; color: var(--tide); }
    h1 { font-size: 1.4rem; margin: 14px 0 8px; }
  `,
  template: `
    <div class="wrap">
      <i class="pi pi-link"></i>
      <h1>{{ 'landing.title' | translate }}</h1>
      <p class="muted">{{ 'landing.lead' | translate }}</p>
    </div>
  `,
})
export class LandingPage {}
