import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { Tooltip } from 'primeng/tooltip';
import { filter } from 'rxjs';

import { Role, Screen } from '../core/api.types';
import { AuthService } from '../core/auth/auth.service';
import { ContactInboxService } from '../core/contact-inbox.service';
import { LanguageService } from '../core/i18n/language.service';
import { PlanFeatureKey } from '../core/plan-features';
import { TenantService } from '../core/tenant.service';
import { UpgradeService } from '../core/upgrade.service';
import { GlobalSearch } from './global-search';
import { NotificationBell } from './notification-bell';
import { UpgradeDialog } from './upgrade-dialog';

type NavSection = 'platform' | 'work' | 'finance' | 'manage' | 'system';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  roles: Role[];
  section: NavSection;
  /** Plan feature needed; without it the item shows a lock and opens the upgrade dialog. */
  feature?: PlanFeatureKey;
  /** Shows a count of items waiting (e.g. new contact requests). */
  badge?: 'contact';
  /** Coordinators see it only with this screen (Team page). */
  screen?: Screen;
}

const NAV: NavItem[] = [
  { path: '/platform', icon: 'pi pi-gauge', label: 'nav.platformOverview', roles: ['PLATFORM_ADMIN'], section: 'platform' },
  { path: '/platform/companies', icon: 'pi pi-building', label: 'nav.platformCompanies', roles: ['PLATFORM_ADMIN'], section: 'platform' },
  { path: '/platform/plans', icon: 'pi pi-tags', label: 'nav.platformPlans', roles: ['PLATFORM_ADMIN'], section: 'platform' },
  { path: '/platform/settings', icon: 'pi pi-sliders-h', label: 'nav.platformSettings', roles: ['PLATFORM_ADMIN'], section: 'platform' },
  { path: '/dashboard', icon: 'pi pi-home', label: 'nav.dashboard', roles: ['OWNER', 'COORDINATOR'], section: 'work', screen: 'DASHBOARD' },
  { path: '/today', icon: 'pi pi-briefcase', label: 'nav.today', roles: ['TECHNICIAN'], section: 'work' },
  { path: '/calendar', icon: 'pi pi-calendar', label: 'nav.calendar', roles: ['OWNER', 'COORDINATOR'], section: 'work', screen: 'CALENDAR' },
  { path: '/bookings', icon: 'pi pi-inbox', label: 'nav.bookings', roles: ['OWNER', 'COORDINATOR'], section: 'work', screen: 'BOOKINGS' },
  { path: '/messages', icon: 'pi pi-comments', label: 'nav.messages', roles: ['OWNER', 'COORDINATOR'], section: 'work', screen: 'MESSAGES' },
  { path: '/contact-requests', icon: 'pi pi-envelope', label: 'nav.contactRequests', roles: ['OWNER', 'COORDINATOR'], section: 'work', badge: 'contact', screen: 'CONTACT_REQUESTS' },
  { path: '/reviews', icon: 'pi pi-star', label: 'nav.reviews', roles: ['OWNER', 'COORDINATOR'], section: 'work', screen: 'REVIEWS' },
  { path: '/invoices', icon: 'pi pi-file', label: 'nav.invoices', roles: ['OWNER', 'COORDINATOR'], section: 'finance', feature: 'quotes_invoices', screen: 'INVOICES' },
  { path: '/quotes', icon: 'pi pi-file-edit', label: 'nav.quotes', roles: ['OWNER', 'COORDINATOR'], section: 'finance', feature: 'quotes_invoices', screen: 'QUOTES' },
  { path: '/reports', icon: 'pi pi-chart-bar', label: 'nav.reports', roles: ['OWNER', 'COORDINATOR'], section: 'finance', feature: 'reports', screen: 'REPORTS' },
  { path: '/sales', icon: 'pi pi-shopping-cart', label: 'nav.sales', roles: ['OWNER', 'COORDINATOR'], section: 'finance', feature: 'reports', screen: 'SALES' },
  { path: '/finance', icon: 'pi pi-wallet', label: 'nav.finance', roles: ['OWNER', 'COORDINATOR'], section: 'finance', feature: 'reports', screen: 'EXPENSES' },
  { path: '/payroll', icon: 'pi pi-money-bill', label: 'nav.payroll', roles: ['OWNER'], section: 'finance', feature: 'reports' },
  { path: '/customers', icon: 'pi pi-users', label: 'nav.customers', roles: ['OWNER', 'COORDINATOR'], section: 'manage', screen: 'CUSTOMERS' },
  { path: '/services', icon: 'pi pi-list-check', label: 'nav.services', roles: ['OWNER', 'COORDINATOR'], section: 'manage', screen: 'SERVICES' },
  { path: '/technicians', icon: 'pi pi-wrench', label: 'nav.technicians', roles: ['OWNER', 'COORDINATOR'], section: 'manage', screen: 'TECHNICIANS' },
  { path: '/users', icon: 'pi pi-id-card', label: 'nav.users', roles: ['OWNER'], section: 'system' },
  { path: '/settings', icon: 'pi pi-cog', label: 'nav.settings', roles: ['OWNER'], section: 'system' },
];
const SECTION_ORDER: NavSection[] = ['platform', 'work', 'finance', 'manage', 'system'];

/** Length of the free trial given at signup (see the backend signup flow). */
const TRIAL_DAYS = 14;
const COLLAPSED_KEY = 'fo.sidebar.collapsed';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, Button, Menu, Tooltip, UpgradeDialog, GlobalSearch, NotificationBell],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly lang = inject(LanguageService);
  protected readonly tenants = inject(TenantService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly inbox = inject(ContactInboxService);

  protected readonly menuOpen = signal(false);
  /** Search and the attention bell are for the office; technicians work from their visit list. */
  protected readonly isOffice = computed(() => this.auth.hasRole('OWNER', 'COORDINATOR'));
  protected readonly upgrade = inject(UpgradeService);
  protected readonly upgradeOpen = this.upgrade.open;
  /** Desktop only: icon rail instead of the full sidebar. Remembered per browser. */
  protected readonly collapsed = signal(readCollapsed());

  /** Nav items grouped under small section headings; empty sections are dropped (e.g. for technicians). */
  protected readonly sections = computed(() => {
    const items = NAV.filter((n) => this.auth.hasRole(...n.roles) && (!n.screen || !this.auth.hasRole('COORDINATOR') || this.auth.canSee(n.screen)));
    return SECTION_ORDER.map((s) => ({ key: s, items: items.filter((i) => i.section === s) })).filter((s) => s.items.length);
  });

  protected readonly trialProgress = computed(() => {
    const left = this.tenants.trialDaysLeft();
    return left === null ? 0 : Math.min(100, Math.max(4, Math.round(((TRIAL_DAYS - left) / TRIAL_DAYS) * 100)));
  });

  protected readonly initials = computed(() => {
    const name = this.auth.user()?.name?.trim() ?? '';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || '?';
  });

  /** Tooltips sit on the side away from the sidebar (left in Arabic, right in English). */
  protected readonly tooltipSide = computed(() => (this.lang.current() === 'ar' ? 'left' : 'right'));

  protected readonly accountItems = computed<MenuItem[]>(() => {
    this.lang.current(); // rebuild labels when the language changes
    const t = (k: string) => this.translate.instant(k);
    return [
      { label: t('password.title'), icon: 'pi pi-key', routerLink: '/change-password' },
      { label: this.lang.current() === 'ar' ? 'English' : 'العربية', icon: 'pi pi-globe', command: () => this.lang.toggle() },
      { separator: true },
      { label: t('shell.logout'), icon: 'pi pi-sign-out', styleClass: 'menu-danger', command: () => this.auth.logout() },
    ];
  });

  ngOnInit(): void {
    this.tenants.ensureLoaded().subscribe({ error: () => {} });
    if (this.auth.canSee('CONTACT_REQUESTS')) {
      this.inbox.refreshCount();
    }
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.menuOpen.set(false);
      // Cheap count query; keeps the badge fresh as the office moves around the app.
      if (this.auth.canSee('CONTACT_REQUESTS')) {
        this.inbox.refreshCount();
      }
    });
  }

  protected badgeCount(item: NavItem): number {
    return item.badge === 'contact' ? this.inbox.newCount() : 0;
  }

  protected isLocked(item: NavItem): boolean {
    return !!item.feature && this.tenants.locked(item.feature);
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // storage blocked (private mode): the choice just isn't remembered
    }
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}
