import { Component, DOCUMENT, HostListener, computed, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { CompanyStore } from '../../../core/company.store';
import { LanguageService } from '../../../core/language.service';
import { SessionService } from '../../../core/session.service';
import { InboxBell } from '../inbox-bell/inbox-bell';

/**
 * Top bar of the portal: brand, the company page's sections, language, account and "Book now".
 * Wide screens show everything in one row. Below 1180px the sections move into a menu that opens under the bar
 * (with booking, the customer's own pages and the language), so nothing is ever cut off or scrolled away.
 * The customer's own pages (my visits, invoices) are in the account menu and in the menu under the bar.
 */
@Component({
  selector: 'pt-public-header',
  imports: [RouterLink, RouterLinkActive, TranslatePipe, InboxBell],
  styleUrl: './public-header.scss',
  templateUrl: './public-header.html',
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
  /** The customer's own pages (a visitor who isn't signed in is asked to sign in first). */
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
