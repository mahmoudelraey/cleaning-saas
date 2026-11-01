import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { Tooltip } from 'primeng/tooltip';
import { filter } from 'rxjs';

import { Role } from '../core/api.types';
import { AuthService } from '../core/auth/auth.service';
import { LanguageService } from '../core/i18n/language.service';
import { PlanFeatureKey } from '../core/plan-features';
import { TenantService } from '../core/tenant.service';
import { UpgradeService } from '../core/upgrade.service';
import { GlobalSearch } from './global-search';
import { NotificationBell } from './notification-bell';
import { UpgradeDialog } from './upgrade-dialog';

type NavSection = 'work' | 'finance' | 'manage' | 'system';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  roles: Role[];
  section: NavSection;
  /** Plan feature needed; without it the item shows a lock and opens the upgrade dialog. */
  feature?: PlanFeatureKey;
}

const NAV: NavItem[] = [
  { path: '/dashboard', icon: 'pi pi-home', label: 'nav.dashboard', roles: ['OWNER', 'COORDINATOR'], section: 'work' },
  { path: '/today', icon: 'pi pi-briefcase', label: 'nav.today', roles: ['TECHNICIAN'], section: 'work' },
  { path: '/calendar', icon: 'pi pi-calendar', label: 'nav.calendar', roles: ['OWNER', 'COORDINATOR'], section: 'work' },
  { path: '/bookings', icon: 'pi pi-inbox', label: 'nav.bookings', roles: ['OWNER', 'COORDINATOR'], section: 'work' },
  { path: '/messages', icon: 'pi pi-comments', label: 'nav.messages', roles: ['OWNER', 'COORDINATOR'], section: 'work' },
  { path: '/invoices', icon: 'pi pi-file', label: 'nav.invoices', roles: ['OWNER', 'COORDINATOR'], section: 'finance', feature: 'quotes_invoices' },
  { path: '/quotes', icon: 'pi pi-file-edit', label: 'nav.quotes', roles: ['OWNER', 'COORDINATOR'], section: 'finance', feature: 'quotes_invoices' },
  { path: '/reports', icon: 'pi pi-chart-bar', label: 'nav.reports', roles: ['OWNER'], section: 'finance', feature: 'reports' },
  { path: '/customers', icon: 'pi pi-users', label: 'nav.customers', roles: ['OWNER', 'COORDINATOR'], section: 'manage' },
  { path: '/services', icon: 'pi pi-list-check', label: 'nav.services', roles: ['OWNER', 'COORDINATOR'], section: 'manage' },
  { path: '/technicians', icon: 'pi pi-wrench', label: 'nav.technicians', roles: ['OWNER', 'COORDINATOR'], section: 'manage' },
  { path: '/users', icon: 'pi pi-id-card', label: 'nav.users', roles: ['OWNER'], section: 'system' },
  { path: '/settings', icon: 'pi pi-cog', label: 'nav.settings', roles: ['OWNER'], section: 'system' },
];
const SECTION_ORDER: NavSection[] = ['work', 'finance', 'manage', 'system'];

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

  protected readonly menuOpen = signal(false);
  /** Search and the attention bell are for the office; technicians work from their visit list. */
  protected readonly isOffice = computed(() => this.auth.hasRole('OWNER', 'COORDINATOR'));
  protected readonly upgrade = inject(UpgradeService);
  protected readonly upgradeOpen = this.upgrade.open;
  /** Desktop only: icon rail instead of the full sidebar. Remembered per browser. */
  protected readonly collapsed = signal(readCollapsed());

  /** Nav items grouped under small section headings; empty sections are dropped (e.g. for technicians). */
  protected readonly sections = computed(() => {
    const items = NAV.filter((n) => this.auth.hasRole(...n.roles));
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
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.menuOpen.set(false));
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
