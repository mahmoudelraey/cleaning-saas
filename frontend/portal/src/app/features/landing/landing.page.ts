import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Opened without a company link: explain where the link comes from, or let the customer type the company code. */
@Component({
  selector: 'pt-landing',
  imports: [FormsModule, TranslatePipe],
  styles: `
    .wrap { max-width: 440px; margin: 16vh auto 0; padding: 0 16px; text-align: center; }
    i { font-size: 2rem; color: var(--tide); }
    h1 { font-size: 1.4rem; margin: 14px 0 8px; }
    form { margin-top: 28px; text-align: start; }
    .row { display: flex; gap: 8px; }
    .row .input { flex: 1; }
  `,
  template: `
    <div class="wrap">
      <i class="pi pi-link"></i>
      <h1>{{ 'landing.title' | translate }}</h1>
      <p class="muted">{{ 'landing.lead' | translate }}</p>
      <form (ngSubmit)="go()">
        <div class="field">
          <label for="slug">{{ 'landing.code' | translate }}</label>
          <div class="row">
            <input id="slug" class="input ltr" name="slug" [(ngModel)]="slug" autocapitalize="off" autocomplete="off"
                   spellcheck="false" [placeholder]="'landing.codePlaceholder' | translate" />
            <button class="btn btn-primary" [disabled]="!clean()">{{ 'landing.open' | translate }}</button>
          </div>
        </div>
      </form>
    </div>
  `,
})
export class LandingPage {
  private readonly router = inject(Router);
  protected slug = '';

  /** Accepts the code or a pasted link (…/p/{code}). */
  protected clean(): string {
    const v = this.slug.trim().toLowerCase();
    const fromLink = v.match(/\/p\/([^/?#]+)/);
    return (fromLink ? fromLink[1] : v).replace(/[^a-z0-9-]/g, '');
  }

  protected go(): void {
    const s = this.clean();
    if (s) void this.router.navigate(['/p', s]);
  }
}
