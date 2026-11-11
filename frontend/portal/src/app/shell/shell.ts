import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { CompanyStore } from '../core/company.store';
import { PortalApi } from '../core/portal.api';
import { SessionService } from '../core/session.service';
import { AnnouncementBar } from '../features/company/announcement-bar';
import { PublicFooter } from '../features/company/public-footer';
import { PublicHeader } from '../features/company/public-header';

@Component({
  selector: 'pt-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, AnnouncementBar, PublicHeader, PublicFooter],
  styles: `
    :host { display: flex; flex-direction: column; min-height: 100vh; }
    .main { flex: 1; }

    /* Customers' own pages on phones: app-style tabs at the bottom. */
    nav.tabs-nav { position: fixed; inset-inline: 0; bottom: 0; z-index: 30; background: var(--surface);
                   border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); }
    .tabs { max-width: 640px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); height: var(--tabbar); }
    .tabs a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
              color: var(--ink-3); text-decoration: none; font-size: .74rem; font-weight: 600; }
    .tabs a i { font-size: 1.2rem; }
    .tabs a.active { color: var(--tide); }

    /* Wide screens use the account menu in the header instead. */
    @media (min-width: 860px) { nav.tabs-nav { display: none; } }

    .gone { max-width: 420px; margin: 18vh auto 0; text-align: center; padding: 0 16px; }
    .gone i { font-size: 2rem; color: var(--ink-3); }
  `,
  template: `
    @if (missing()) {
      <div class="gone">
        <i class="pi pi-link"></i>
        <h1 style="font-size:1.3rem; margin-top:12px">{{ 'shell.notFound' | translate }}</h1>
        <p class="muted">{{ 'shell.notFoundHint' | translate }}</p>
      </div>
    } @else {
      <!-- The company's announced promo, on every page of its portal. -->
      <pt-announcement-bar />
      <pt-public-header [current]="section()" />
      @if (showNav()) {
        <nav class="tabs-nav" [attr.aria-label]="'shell.nav' | translate">
          <div class="tabs">
            <a [routerLink]="['/', slug(), 'bookings']" routerLinkActive="active">
              <i class="pi pi-calendar"></i>{{ 'shell.bookings' | translate }}
            </a>
            <a [routerLink]="['/', slug(), 'invoices']" routerLinkActive="active">
              <i class="pi pi-receipt"></i>{{ 'shell.invoices' | translate }}
            </a>
            <a [routerLink]="['/', slug(), 'profile']" routerLinkActive="active">
              <i class="pi pi-user"></i>{{ 'shell.profile' | translate }}
            </a>
          </div>
        </nav>
      }
      <div class="main"><router-outlet /></div>
      <pt-public-footer />
    }
  `,
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
