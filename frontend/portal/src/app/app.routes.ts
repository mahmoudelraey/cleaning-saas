import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';

import { signedIn } from './core/guards';

/** Contact us is a section of the company page now; old /about and /contact links land on the company page. */
const toSection =
  (fragment: string): CanActivateFn =>
  (route) =>
    inject(Router).createUrlTree(['/', route.parent?.paramMap.get('slug') ?? ''], { fragment, queryParams: route.queryParams });

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing.page').then((m) => m.LandingPage) },
  // Old links (…/p/{slug}/…) keep working.
  { path: 'p/:slug', redirectTo: ':slug' },
  {
    path: ':slug',
    loadComponent: () => import('./shell/shell').then((m) => m.Shell),
    children: [
      // Public company page: services, ratings and contact us, all on one page. Open to everyone.
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/company/company.page').then((m) => m.CompanyPage) },
      { path: 'contact', canActivate: [toSection('contact')], children: [] },
      { path: 'about', redirectTo: '', pathMatch: 'full' },
      { path: 'register', loadComponent: () => import('./features/register/register.page').then((m) => m.RegisterPage) },
      { path: 'login', loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage) },
      {
        path: '',
        canActivate: [signedIn],
        children: [
          { path: 'home', loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage) },
          { path: 'bookings', loadComponent: () => import('./features/bookings/bookings.page').then((m) => m.BookingsPage) },
          {
            path: 'bookings/:id',
            loadComponent: () => import('./features/bookings/booking-detail.page').then((m) => m.BookingDetailPage),
          },
          { path: 'book', loadComponent: () => import('./features/book/book.page').then((m) => m.BookPage) },
          { path: 'invoices', loadComponent: () => import('./features/invoices/invoices.page').then((m) => m.InvoicesPage) },
          { path: 'profile', loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
