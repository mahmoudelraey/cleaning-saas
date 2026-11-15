import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Opened without a company link: explain where the link comes from, or let the customer type the company code. */
@Component({
  selector: 'pt-landing',
  imports: [FormsModule, TranslatePipe],
  styleUrl: './landing.page.scss',
  templateUrl: './landing.page.html',
})
export class LandingPage {
  private readonly router = inject(Router);
  protected slug = '';

  /** Accepts the code or a pasted link (https://…/{code}, or an old …/p/{code} link). */
  protected clean(): string {
    const v = this.slug.trim().toLowerCase();
    const path = v.includes('/') ? v.replace(/^[a-z]+:\/\//, '').replace(/^[^/]*/, '') : v;
    const segments = path.split(/[?#]/)[0].split('/').filter(Boolean);
    const code = segments[0] === 'p' ? segments[1] : segments[0];
    return (code ?? '').replace(/[^a-z0-9-]/g, '');
  }

  protected go(): void {
    const s = this.clean();
    if (s) void this.router.navigate(['/', s]);
  }
}
