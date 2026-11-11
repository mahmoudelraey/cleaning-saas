import { Component, DOCUMENT, HostListener, computed, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { CompanyStore } from '../../core/company.store';
import { LanguageService } from '../../core/language.service';
import { SessionService } from '../../core/session.service';
import { InboxBell } from './inbox-bell';

/**
 * Top bar of the portal: brand, the company page's sections, language, account and "Book a visit now".
 * Wide screens show everything in one row. Below 1240px the sections move into a menu that opens under the bar
 * (with booking, the customer's own pages and the language), so nothing is ever cut off or scrolled away.
 * The menu: the company page's sections, with the customer's own pages (my visits, invoices) after "Services".
 */
@Component({
  selector: 'pt-public-header',
  imports: [RouterLink, RouterLinkActive, TranslatePipe, InboxBell],
  styles: `
    :host { display: block; position: sticky; top: 0; z-index: 20; }
    /* Two floating white cards (brand + menu, and the actions) over a soft mint strip, as in the design. */
    .bar { position: relative; background: linear-gradient(180deg, #f3faf8 0%, rgba(243, 250, 248, .82) 100%);
           backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .row { position: relative; z-index: 2; max-width: 1600px; margin: 0 auto; display: flex; align-items: stretch; gap: 14px;
           padding: 12px 20px; }
    .nav-card, .actions { background: #fff; border-radius: 18px; border: 1px solid rgba(226, 232, 240, .7);
                          box-shadow: 0 10px 30px -18px rgba(15, 42, 61, .35); }
    .nav-card { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 18px; padding: 12px 24px; min-height: 80px; }

    .brand { flex: 0 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px; text-decoration: none; }
    .mark { width: 52px; height: 52px; border-radius: 14px; background: #f0fdf8; box-shadow: 0 4px 10px -4px rgba(13, 92, 70, .35);
            display: grid; place-items: center; overflow: hidden; flex: none; }
    .mark img { width: 100%; height: 100%; object-fit: contain; }
    /* The name may shrink (with "…") but never runs over the logo or the links. */
    .name { min-width: 0; flex: 0 1 auto; font-weight: 900; font-size: 1.1rem; color: #0d5c46; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            max-width: 18ch; }

    nav.links { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: flex-start; gap: 2px; }
    nav.links a { position: relative; padding: 10px 12px; color: #334155; text-decoration: none; font-weight: 600; font-size: 1rem;
                  white-space: nowrap; }
    nav.links a:hover { color: #149b74; }
    nav.links a::after { content: ''; position: absolute; inset-inline: 12px; bottom: 2px; height: 2px; border-radius: 2px;
                         background: #149b74; transform: scaleX(0); transition: transform .2s; }
    nav.links a:hover::after, nav.links a.on::after { transform: scaleX(1); }
    nav.links a.on { color: #0d5c46; }


    .actions { display: flex; align-items: center; gap: 10px; flex: none; padding: 10px 12px; }
    .pill { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 12px;
            font: inherit; font-size: .92rem; font-weight: 700; padding: 12px 20px; cursor: pointer; text-decoration: none;
            white-space: nowrap; }
    .lang { background: none; color: #334155; border: 1px solid #e2e8f0; padding: 9px 14px; border-radius: 999px; }
    .lang:hover { background: #f1f5f9; }
    .soft { background: #f0fdf8; color: #0d5c46; }
    .soft:hover { background: #ddf7ed; }
    .book-cta { background: linear-gradient(90deg, #0d5c46, #149b74); color: #fff; font-weight: 800;
                box-shadow: 0 4px 12px -4px rgba(13, 92, 70, .5); transition: transform .2s, box-shadow .2s; }
    .book-cta:hover { transform: scale(1.04); box-shadow: 0 12px 24px -10px rgba(13, 92, 70, .6); }
    .book-cta i { color: #ffc107; }
    .icon-btn { width: 44px; height: 44px; padding: 0; border-radius: 12px; background: #f1f5f9; color: #334155; font-size: 1.15rem; }
    .icon-btn:hover { background: #e2e8f0; }
    .pill:focus-visible, nav a:focus-visible, .brand:focus-visible, .me:focus-visible {
      outline: 3px solid rgba(20, 155, 116, .35); outline-offset: 2px; }

    /* Account */
    .account { position: relative; }
    .me { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; border: 1px solid #e2e8f0; border-radius: 999px;
          background: #fff; color: #1e293b; font: inherit; cursor: pointer; }
    :host-context([dir='rtl']) .me { padding: 4px 4px 4px 12px; }
    .me-avatar { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; flex: none;
                 background: linear-gradient(160deg, #149b74, #0d5c46); color: #fff; }
    .who { font-weight: 700; font-size: .9rem; max-width: 10ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .caret { font-size: .7rem; opacity: .7; }
    .menu-backdrop { position: fixed; inset: 0; z-index: 1; }
    .menu { position: absolute; inset-inline-end: 0; top: calc(100% + 8px); z-index: 2; min-width: 220px; list-style: none; margin: 0;
            padding: 6px; background: #fff; border-radius: 16px; box-shadow: 0 22px 50px -20px rgba(15, 42, 61, .5);
            border: 1px solid #e2e8f0; }
    .menu a, .menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 10px;
                            color: #1e293b; text-decoration: none; font: inherit; font-size: .93rem; background: none; border: 0;
                            cursor: pointer; text-align: start; }
    .menu i { color: #149b74; width: 1.1em; }
    .menu a:hover, .menu button:hover { background: #f8fafc; }
    .menu a.on { background: #f0fdf8; color: #0d5c46; font-weight: 700; }
    .menu .sep { border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 4px; }
    .menu .sep i { color: var(--rose); }

    /* Drawer under the bar (below 1100px) */
    .burger { display: none; }
    .drawer { position: relative; z-index: 1; margin: 0 20px 12px; border-radius: 18px; border: 1px solid #e2e8f0; background: #fff;
              box-shadow: 0 20px 30px -20px rgba(15, 23, 42, .3); }
    .drawer-in { max-width: 1560px; margin: 0 auto; padding: 12px 20px 18px; display: flex; flex-direction: column; gap: 4px; }
    .drawer a.item, .drawer button.item { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px;
                                          color: #1e293b; font: inherit; font-weight: 700; text-decoration: none; background: none;
                                          border: 0; cursor: pointer; text-align: start; }
    .drawer a.item i, .drawer button.item i { color: #149b74; width: 1.2em; }
    .drawer a.item:hover, .drawer button.item:hover, .drawer a.item.on { background: #f0fdf8; color: #0d5c46; }
    .drawer hr { border: 0; border-top: 1px solid #f1f5f9; margin: 6px 0; width: 100%; }
    .drawer .drawer-cta { display: grid; gap: 8px; margin-top: 8px; }
    .drawer .drawer-cta .pill { padding: 13px; }

    /* Medium: the sections go into the drawer; the account shows only its avatar. */
    /* English names and labels are longer, so the links move into the menu a bit earlier. */
    @media (max-width: 1359px) {
      nav.links { display: none; }
      .burger { display: inline-flex; }
      .who, .me .caret { display: none; }
      .me { padding: 3px !important; }
    }
    /* Phones: booking and the language move into the drawer too (the page has its own booking bar). */
    @media (max-width: 680px) {
      .row { padding: 8px 10px; gap: 8px; }
      .nav-card { padding: 8px 12px; min-height: 56px; }
      .actions { padding: 6px; }
      .mark { width: 40px; height: 40px; }
      .name { font-size: 1rem; max-width: 14ch; }
      .hide-sm { display: none !important; }
      .actions { gap: 6px; }
      .icon-btn { width: 40px; height: 40px; }
      .soft .label { display: none; }
      .soft { padding: 10px 12px; }
    }
  `,
  template: `
    <div class="bar">
      <div class="row">
        <div class="nav-card">
        <a class="brand" [routerLink]="['/', slug()]">
          <span class="mark"><img [src]="store.company()?.logoUrl || 'brand/logo-mark.svg'" alt="" /></span>
          <span class="name">{{ store.name() }}</span>
        </a>

        <nav class="links" [attr.aria-label]="'company.menu' | translate">
          <!-- Every link is a section of the company page; the one in view is underlined. -->
          @for (l of links; track l.id) {
            <a [routerLink]="['/', slug()]" [fragment]="l.id" [class.on]="active() === l.id" (click)="jump(l.id)">{{ l.label | translate }}</a>
            <!-- The customer's own pages sit right after "Services" (visitors are asked to sign in first). -->
            @if (l.id === 'services') {
              @for (m of myPages; track m.path) {
                <a [routerLink]="['/', slug(), m.path]" routerLinkActive="on">{{ m.label | translate }}</a>
              }
            }
          }
        </nav>
        </div>

        <div class="actions">
          <!-- A signed-in customer switches the language from the avatar menu. -->
          @if (!signedIn()) {
            <button type="button" class="pill lang hide-sm" (click)="lang.toggle()" [attr.aria-label]="'company.switchLang' | translate">
              <i class="pi pi-globe" aria-hidden="true"></i>{{ lang.current() === 'ar' ? 'English' : 'العربية' }}
            </button>
          }

          @if (signedIn()) {
            <pt-inbox-bell [slug]="slug()" />
            <div class="account">
              <button type="button" class="me" [attr.aria-expanded]="menuOpen()" aria-haspopup="true" aria-controls="account-menu"
                      [attr.aria-label]="'shell.profile' | translate" (click)="menuOpen.set(!menuOpen()); drawerOpen.set(false)">
                <span class="me-avatar"><i class="pi pi-user" aria-hidden="true"></i></span>
                <span class="who">{{ firstName() || ('shell.profile' | translate) }}</span>
                <i class="pi pi-chevron-down caret" aria-hidden="true"></i>
              </button>
              @if (menuOpen()) {
                <div class="menu-backdrop" (click)="menuOpen.set(false)"></div>
                <ul class="menu" id="account-menu" (click)="menuOpen.set(false)">
                  <li><a [routerLink]="['/', slug(), 'profile']" routerLinkActive="on"><i class="pi pi-user"></i>{{ 'shell.profile' | translate }}</a></li>
                  <li><button type="button" (click)="lang.toggle()"><i class="pi pi-globe"></i>{{ lang.current() === 'ar' ? 'English' : 'العربية' }}</button></li>
                  <li class="sep"><button type="button" (click)="signOut()"><i class="pi pi-sign-out"></i>{{ 'profile.signOut' | translate }}</button></li>
                </ul>
              }
            </div>
          } @else {
            <a class="pill soft" [routerLink]="['/', slug(), 'login']" [attr.aria-label]="'company.myAccount' | translate">
              <i class="pi pi-user" aria-hidden="true"></i><span class="label">{{ 'company.myAccount' | translate }}</span>
            </a>
          }

          @if (store.company()?.bookingOpen) {
            <a class="pill book-cta hide-sm" [routerLink]="['/', slug(), 'book']">
              <i class="pi pi-calendar-plus" aria-hidden="true"></i>{{ 'company.bookNow' | translate }}
            </a>
          }

          <button type="button" class="pill icon-btn burger" [attr.aria-expanded]="drawerOpen()" aria-controls="site-drawer"
                  [attr.aria-label]="'company.menu' | translate" (click)="drawerOpen.set(!drawerOpen()); menuOpen.set(false)">
            <i class="pi" [class]="drawerOpen() ? 'pi-times' : 'pi-bars'" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      @if (drawerOpen()) {
        <div class="drawer" id="site-drawer">
          <nav class="drawer-in" [attr.aria-label]="'company.menu' | translate" (click)="drawerOpen.set(false)">
            @for (l of links; track l.id) {
              <a class="item" [routerLink]="['/', slug()]" [fragment]="l.id" [class.on]="active() === l.id" (click)="jump(l.id)">
                <i class="pi" [class]="l.icon" aria-hidden="true"></i>{{ l.label | translate }}
              </a>
              @if (l.id === 'services') {
                @for (m of myPages; track m.path) {
                  <a class="item" [routerLink]="['/', slug(), m.path]" routerLinkActive="on"><i class="pi" [class]="m.icon"></i>{{ m.label | translate }}</a>
                }
              }
            }
            <hr />
            <button type="button" class="item" (click)="lang.toggle()">
              <i class="pi pi-globe" aria-hidden="true"></i>{{ lang.current() === 'ar' ? 'English' : 'العربية' }}
            </button>
            @if (store.company()?.bookingOpen) {
              <div class="drawer-cta">
                <a class="pill book-cta" [routerLink]="['/', slug(), 'book']">
                  <i class="pi pi-calendar-plus" aria-hidden="true"></i>{{ 'company.bookNow' | translate }}
                </a>
              </div>
            }
          </nav>
        </div>
      }
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
  protected readonly drawerOpen = signal(false);
  /** The customer's own pages, in the menu after "Services" (a visitor who isn't signed in is asked to sign in first). */
  protected readonly myPages = [
    { path: 'bookings', label: 'shell.bookings', icon: 'pi-calendar' },
    { path: 'invoices', label: 'shell.invoices', icon: 'pi-receipt' },
  ];
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  /** The company page's sections, in page order. */
  protected readonly links = [
    { id: 'services', label: 'company.services', icon: 'pi-th-large' },
    { id: 'how', label: 'company.instructions', icon: 'pi-list-check' },
    { id: 'reviews', label: 'company.reviews', icon: 'pi-star' },
    { id: 'contact', label: 'company.contact', icon: 'pi-phone' },
    { id: 'about', label: 'company.aboutUs', icon: 'pi-info-circle' },
  ];
  /** The section under the header right now (only on the company page). */
  protected readonly active = signal<string | null>(null);

  constructor() {
    // Any navigation closes the menus.
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.drawerOpen.set(false);
      this.menuOpen.set(false);
    });
  }

  @HostListener('document:keydown.escape')
  protected closeAll(): void {
    this.drawerOpen.set(false);
    this.menuOpen.set(false);
  }

  @HostListener('window:scroll')
  protected onScroll(): void {
    if (this.current() !== 'home') {
      this.active.set(null);
      return;
    }
    let on: string | null = null;
    for (const l of this.links) {
      const top = this.document.getElementById(l.id)?.getBoundingClientRect().top;
      if (top !== undefined && top <= 120) on = l.id;
    }
    // At the very bottom the last short section may never reach the top: mark it anyway.
    const el = this.document.documentElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) on = this.links.at(-1)!.id;
    this.active.set(on);
  }

  /** Clicking the section that is already in the address does no navigation, so scroll to it here. */
  protected jump(id: string): void {
    if (this.current() === 'home' && this.router.parseUrl(this.router.url).fragment === id) {
      this.document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }
  }

  protected signOut(): void {
    this.sessions.clear(this.slug());
    void this.router.navigate(['/', this.slug()]);
  }
}
