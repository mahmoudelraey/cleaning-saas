import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { CompanyStore } from '../core/company.store';
import { PortalApi } from '../core/portal.api';
import { SessionService } from '../core/session.service';
import { AnnouncementBar } from '../features/company/announcement-bar/announcement-bar';
import { PublicFooter } from '../features/company/public-footer/public-footer';
import { PublicHeader } from '../features/company/public-header/public-header';

@Component({
  selector: 'pt-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, AnnouncementBar, PublicHeader, PublicFooter],
  styleUrl: './shell.scss',
  templateUrl: './shell.html',
})
export class Shell implements OnInit {
  protected readonly store = inject(CompanyStore);
  private readonly api = inject(PortalApi);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);

  readonly slug = input.required<string>();
  protected readonly missing = signal(false);
  private readonly url = signal(this.router.url);

  /** Which public page is open, so the header can mark it ('none' on sign-in and customers' own pages). */
  protected readonly section = computed<'home' | 'about' | 'contact' | 'none'>(() => {
    const path = this.url().split(/[?#]/)[0].replace(/\/+$/, '');
    if (/^\/[^/]+$/.test(path)) return 'home';
    if (/^\/[^/]+\/about$/.test(path)) return 'about';
    if (/^\/[^/]+\/contact$/.test(path)) return 'contact';
    return 'none';
  });
  /** Bottom tabs only on customers' own pages (never on the public pages, sign-in or the booking wizard). */
  protected readonly showNav = computed(
    () =>
      this.section() === 'none' &&
      !/\/(login|register|book)(\?|#|$)/.test(this.url()) &&
      !!this.sessions.get(this.slug()),
  );

  ngOnInit(): void {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e) => this.url.set(e.urlAfterRedirects));
    this.store.slug.set(this.slug());
    if (this.store.company()?.slug?.toLowerCase() !== this.slug().toLowerCase()) {
      this.store.company.set(null);
    }
    this.api.company(this.slug()).subscribe({
      next: (c) => {
        this.store.company.set(c);
        document.title = this.store.name() || c.name;
      },
      error: () => this.missing.set(true),
    });
  }
}
