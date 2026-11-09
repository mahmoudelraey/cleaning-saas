import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CompanyStore } from '../../core/company.store';
import { LanguageService } from '../../core/language.service';
import { SessionService } from '../../core/session.service';
import { InboxBell } from './inbox-bell';

/**
 * Top bar of the public pages (company page and About us): a white strip above the hero with brand, menu,
 * language and the account actions (Sign in + Create account, or My visits once signed in).
 */
@Component({
  selector: 'pt-public-header',
  imports: [RouterLink, RouterLinkActive, TranslatePipe, InboxBell],
  styles: `
    :host { display: block; position: sticky; top: 0; z-index: 20; }
    /* No overflow:hidden here: the account menu opens below the bar. A thin teal line echoes the hero. */
    .bar { position: relative; background: var(--surface); border-radius: 0 0 28px 28px;
           box-shadow: 0 10px 30px -22px rgba(15, 42, 61, .55); border-bottom: 3px solid color-mix(in srgb, var(--tide) 35%, transparent); }
    .row { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 12px;
           padding: 12px 20px; }
    .brand { flex: 0 1 auto; max-width: 260px; display: flex; align-items: center; gap: 10px; color: var(--tide-deep);
             text-decoration: none; min-width: 0; }
    .mark { width: 40px; height: 40px; border-radius: 50%; background: var(--foam); display: grid; place-items: center;
            overflow: hidden; font-weight: 700; flex: none; color: var(--tide-deep); }
    .mark img { width: 100%; height: 100%; object-fit: contain; }
    .name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* The menu may shrink (English labels are longer); it never pushes the brand or the buttons off screen. */
    nav { display: flex; align-items: center; gap: 2px; flex: 1 1 auto; min-width: 0; justify-content: safe center;
          overflow-x: auto; scrollbar-width: none; }
    nav::-webkit-scrollbar { display: none; }
    nav a { color: var(--ink); text-decoration: none; font-size: .95rem; font-weight: 500; padding: 8px 12px; position: relative;
            white-space: nowrap; flex: none; }
    nav a:hover { color: var(--tide-deep); }
    nav a.on { font-weight: 700; }
    nav .nav-sep { width: 1px; align-self: stretch; margin: 8px 6px; background: var(--line); flex: none; }
    nav a.mine { display: inline-flex; align-items: center; gap: 6px; color: var(--tide-deep); }
    nav a.mine i { font-size: .85rem; }
    nav a.mine.on { background: var(--foam); border-radius: 999px; }

    .actions { display: flex; align-items: center; gap: 8px; flex: none; }
    .pill { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; font: inherit; font-size: .9rem;
            font-weight: 600; padding: 9px 18px; cursor: pointer; text-decoration: none; white-space: nowrap; }
    .pill i { font-size: .95rem; }
    .lang { background: transparent; color: var(--ink); }
    .soft { background: var(--foam); color: var(--tide-deep); }
    .solid { background: var(--tide); color: #fff; box-shadow: 0 10px 20px -12px var(--tide); }
    .solid:hover { background: var(--tide-deep); }
    .pill:focus-visible, nav a:focus-visible, .brand:focus-visible { outline: 3px solid color-mix(in srgb, var(--tide) 45%, transparent);
                                                                      outline-offset: 2px; }

    .account { position: relative; }
    .caret { font-size: .7rem; opacity: .85; }
    .who { max-width: 10ch; overflow: hidden; text-overflow: ellipsis; }
    .menu-backdrop { position: fixed; inset: 0; z-index: 1; }
    .menu { position: absolute; inset-inline-end: 0; top: calc(100% + 8px); z-index: 2; min-width: 210px; list-style: none; margin: 0;
            padding: 6px; background: var(--surface); border-radius: 16px; box-shadow: 0 22px 50px -20px rgba(15, 42, 61, .5);
            border: 1px solid var(--line); }
    .menu a, .menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 10px;
                            color: var(--ink); text-decoration: none; font: inherit; font-size: .93rem; background: none; border: 0;
                            cursor: pointer; text-align: start; }
    .menu i { color: var(--tide); width: 1.1em; }
    .menu a:hover, .menu button:hover { background: var(--mist); }
    .menu a.on { background: var(--foam); color: var(--tide-deep); font-weight: 600; }
    .menu .book { color: var(--tide-deep); font-weight: 600; }
    .menu .sep { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 4px; }
    .menu .sep i { color: var(--rose); }

    /* Medium screens: My visits / Invoices stay in the account menu so the row fits (English labels are longer). */
    @media (min-width: 900px) and (max-width: 1279px) {
      nav a.mine, nav .nav-sep { display: none; }
      nav a { padding: 8px 10px; font-size: .92rem; }
      .pill { padding: 9px 14px; }
      .brand { max-width: 200px; }
    }

    /* Phones: brand + actions on one row, the menu scrolls sideways under it. */
    @media (max-width: 899px) {
      .row { flex-wrap: wrap; padding: 10px 14px; gap: 6px; }
      .brand { flex: 1; }
      nav { order: 3; flex-basis: 100%; justify-content: flex-start; overflow-x: auto; scrollbar-width: none; margin: 0 -6px; }
      nav::-webkit-scrollbar { display: none; }
      nav a { padding: 6px 10px; font-size: .88rem; }
      .hide-sm { display: none; }
      .pill { padding: 8px 12px; font-size: .84rem; }
      .brand { max-width: none; }
    }
  `,
  template: `
    <div class="bar">
      <div class="row">
        <a class="brand" [routerLink]="['/', slug()]">
          <span class="mark">
            <img [src]="store.company()?.logoUrl || 'brand/logo.svg'" alt="" />
          </span>
          <span class="name">{{ store.company()?.name }}</span>
        </a>
        <nav [attr.aria-label]="'company.menu' | translate">
          <a [routerLink]="['/', slug()]" fragment="services" [class.on]="current() === 'home'">{{ 'company.services' | translate }}</a>
          <a [routerLink]="['/', slug(), 'about']" [class.on]="current() === 'about'">{{ 'company.aboutUs' | translate }}</a>
          <a [routerLink]="['/', slug()]" fragment="reviews">{{ 'company.reviews' | translate }}</a>
          <a [routerLink]="['/', slug(), 'contact']" [class.on]="current() === 'contact'">{{ 'company.contact' | translate }}</a>
          @if (signedIn()) {
            <!-- The customer's own pages, once signed in -->
            <span class="nav-sep" aria-hidden="true"></span>
            <a class="mine" [routerLink]="['/', slug(), 'home']" routerLinkActive="on">
              <i class="pi pi-home" aria-hidden="true"></i>{{ 'company.myPage' | translate }}
            </a>
            <!-- Stays highlighted on a visit's own page too (/bookings/:id). -->
            <a class="mine" [routerLink]="['/', slug(), 'bookings']" routerLinkActive="on">
              <i class="pi pi-calendar" aria-hidden="true"></i>{{ 'shell.bookings' | translate }}
            </a>
            <a class="mine" [routerLink]="['/', slug(), 'invoices']" routerLinkActive="on">
              <i class="pi pi-receipt" aria-hidden="true"></i>{{ 'shell.invoices' | translate }}
            </a>
          }
        </nav>
        <div class="actions">
          <button type="button" class="pill lang" (click)="lang.toggle()">
            <i class="pi pi-globe" aria-hidden="true"></i>{{ lang.current() === 'ar' ? 'English' : 'العربية' }}
          </button>
          @if (signedIn()) {
            <pt-inbox-bell [slug]="slug()" />
            <!-- One account menu instead of a second row of tabs. -->
            <div class="account">
              <button type="button" class="pill solid" [attr.aria-expanded]="menuOpen()" aria-haspopup="true"
                      aria-controls="account-menu" (click)="menuOpen.set(!menuOpen())">
                <i class="pi pi-user" aria-hidden="true"></i>
                <span class="who">{{ firstName() || ('shell.profile' | translate) }}</span>
                <i class="pi pi-chevron-down caret" aria-hidden="true"></i>
              </button>
              @if (menuOpen()) {
                <div class="menu-backdrop" (click)="menuOpen.set(false)"></div>
                <ul class="menu" id="account-menu" (click)="menuOpen.set(false)">
                  <li><a [routerLink]="['/', slug(), 'home']" routerLinkActive="on"><i class="pi pi-home"></i>{{ 'shell.home' | translate }}</a></li>
                  <li><a [routerLink]="['/', slug(), 'bookings']" routerLinkActive="on"><i class="pi pi-calendar"></i>{{ 'shell.bookings' | translate }}</a></li>
                  <li><a [routerLink]="['/', slug(), 'invoices']" routerLinkActive="on"><i class="pi pi-receipt"></i>{{ 'shell.invoices' | translate }}</a></li>
                  <li><a [routerLink]="['/', slug(), 'profile']" routerLinkActive="on"><i class="pi pi-user"></i>{{ 'shell.profile' | translate }}</a></li>
                  @if (store.company()?.bookingOpen) {
                    <li><a [routerLink]="['/', slug(), 'book']" class="book"><i class="pi pi-calendar-plus"></i>{{ 'company.book' | translate }}</a></li>
                  }
                  <li class="sep"><button type="button" (click)="signOut()"><i class="pi pi-sign-out"></i>{{ 'profile.signOut' | translate }}</button></li>
                </ul>
              }
            </div>
          } @else {
            <a class="pill soft hide-sm" [routerLink]="['/', slug(), 'login']"><i class="pi pi-sign-in rtl-flip" aria-hidden="true"></i>{{ 'company.signIn' | translate }}</a>
            <a class="pill solid" [routerLink]="['/', slug(), 'register']"><i class="pi pi-user-plus" aria-hidden="true"></i>{{ 'register.title' | translate }}</a>
          }
        </div>
      </div>
    </div>
  `,
})
export class PublicHeader {
  protected readonly store = inject(CompanyStore);
  protected readonly lang = inject(LanguageService);
  private readonly sessions = inject(SessionService);

  /** Which public page is open, to mark it in the menu. */
  readonly current = input<'home' | 'about' | 'contact' | 'none'>('none');

  protected readonly slug = this.store.slug;
  protected readonly signedIn = computed(() => !!this.sessions.get(this.slug()));
  protected readonly firstName = computed(() => (this.sessions.get(this.slug())?.name ?? '').trim().split(/\s+/)[0]);
  protected readonly menuOpen = signal(false);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.sessions.clear(this.slug());
    void this.router.navigate(['/', this.slug()]);
  }
}
