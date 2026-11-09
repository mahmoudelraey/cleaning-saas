import { Routes } from '@angular/router';

import { signedIn } from './core/guards';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing.page').then((m) => m.LandingPage) },
  // Old links (…/p/{slug}/…) keep working.
  { path: 'p/:slug', redirectTo: ':slug' },
  {
    path: ':slug',
    loadComponent: () => import('./shell/shell').then((m) => m.Shell),
    children: [
      // Public company page: who they are, services, ratings, contact. Open to everyone.
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/company/company.page').then((m) => m.CompanyPage) },
      { path: 'contact', loadComponent: () => import('./features/company/contact.page').then((m) => m.ContactPage) },
      { path: 'about', loadComponent: () => import('./features/company/about.page').then((m) => m.AboutPage) },
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
