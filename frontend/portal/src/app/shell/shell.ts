import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { CompanyStore } from '../core/company.store';
import { LanguageService } from '../core/language.service';
import { PortalApi } from '../core/portal.api';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'pt-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  styles: `
    header { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--mist) 88%, transparent);
             backdrop-filter: blur(10px); }
    .bar { max-width: 640px; margin: 0 auto; display: flex; align-items: center; gap: 12px; padding: 12px 16px; }
    .logo { width: 40px; height: 40px; border-radius: 12px; background: var(--surface); display: grid; place-items: center;
            overflow: hidden; flex: none; color: var(--tide); font-weight: 700; }
    .logo img { width: 100%; height: 100%; object-fit: contain; }
    .name { flex: 1; min-width: 0; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lang { border: 0; background: var(--surface); border-radius: 999px; font: inherit; font-size: .85rem; font-weight: 600;
            color: var(--ink-2); padding: 7px 14px; cursor: pointer; }

    nav { position: fixed; inset-inline: 0; bottom: 0; z-index: 30; background: var(--surface);
          border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom); }
    .tabs { max-width: 640px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, 1fr); height: var(--tabbar); }
    .tabs a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
              color: var(--ink-3); text-decoration: none; font-size: .74rem; font-weight: 600; }
    .tabs a i { font-size: 1.2rem; }
    .tabs a.active { color: var(--tide); }

    @media (min-width: 860px) {
      nav { position: static; border: 0; background: none; padding: 0; }
      .tabs { display: flex; gap: 4px; height: auto; padding: 0 16px 4px; }
      .tabs a { flex-direction: row; gap: 8px; font-size: .92rem; padding: 8px 14px; border-radius: 999px; }
      .tabs a.active { background: var(--surface); color: var(--ink); }

    }

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
      <header>
        <div class="bar">
          <span class="logo">
            @if (store.company()?.logoUrl; as logo) { <img [src]="logo" alt="" /> } @else { {{ initial() }} }
          </span>
          <span class="name">{{ store.company()?.name }}</span>
          <button type="button" class="lang" (click)="lang.toggle()">{{ lang.current() === 'ar' ? 'English' : 'العربية' }}</button>
        </div>
      </header>
      @if (showNav()) {
        <nav [attr.aria-label]="'shell.nav' | translate">
          <div class="tabs">
            <a [routerLink]="['/p', slug()]" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
              <i class="pi pi-home"></i>{{ 'shell.home' | translate }}
            </a>
            <a [routerLink]="['/p', slug(), 'bookings']" routerLinkActive="active">
              <i class="pi pi-calendar"></i>{{ 'shell.bookings' | translate }}
            </a>
            <a [routerLink]="['/p', slug(), 'invoices']" routerLinkActive="active">
              <i class="pi pi-receipt"></i>{{ 'shell.invoices' | translate }}
            </a>
            <a [routerLink]="['/p', slug(), 'profile']" routerLinkActive="active">
              <i class="pi pi-user"></i>{{ 'shell.profile' | translate }}
            </a>
          </div>
        </nav>
      }
      <router-outlet />
    }
  `,
})
export class Shell implements OnInit {
  protected readonly store = inject(CompanyStore);
  protected readonly lang = inject(LanguageService);
  private readonly api = inject(PortalApi);
  private readonly sessions = inject(SessionService);
  private readonly router = inject(Router);

  readonly slug = input.required<string>();
  protected readonly missing = signal(false);
  private readonly url = signal(this.router.url);

  protected readonly initial = computed(() => (this.store.company()?.name ?? '').trim().charAt(0));
  protected readonly showNav = computed(
    () => !/\/(login|book)(\?|$)/.test(this.url()) && !!this.sessions.get(this.slug()),
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
        document.title = c.name;
      },
      error: () => this.missing.set(true),
    });
  }
}
