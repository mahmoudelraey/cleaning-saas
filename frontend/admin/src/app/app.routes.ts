import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { AuthService } from './core/auth/auth.service';

import { authGuard, guestGuard, passwordChangedGuard, roleGuard } from './core/auth/auth.guards';
import { featureGuard } from './core/auth/feature.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signup.page').then((m) => m.SignupPage),
  },
  // End-customer pages opened from WhatsApp (no login).
  {
    path: 'i/:token',
    data: { kind: 'invoice' },
    loadComponent: () => import('./features/public/public-document.page').then((m) => m.PublicDocumentPage),
  },
  {
    path: 'q/:token',
    data: { kind: 'quote' },
    loadComponent: () => import('./features/public/public-document.page').then((m) => m.PublicDocumentPage),
  },
  {
    path: 'book/:slug',
    loadComponent: () => import('./features/public/booking.page').then((m) => m.BookingPage),
  },
  {
    path: 'change-password',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/change-password.page').then((m) => m.ChangePasswordPage),
  },
  {
    path: 'subscription-inactive',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/subscription/subscription-inactive.page').then((m) => m.SubscriptionInactivePage),
  },
  {
    path: '',
    canActivate: [authGuard, passwordChangedGuard],
    canActivateChild: [passwordChangedGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        // Technicians land on their day; office staff on the dashboard.
        redirectTo: () => (inject(AuthService).hasRole('TECHNICIAN') ? 'today' : 'dashboard'),
      },
      {
        path: 'today',
        canActivate: [roleGuard('TECHNICIAN')],
        loadComponent: () => import('./features/field/today.page').then((m) => m.TodayPage),
      },
      {
        path: 'visit/:id',
        canActivate: [roleGuard('TECHNICIAN')],
        loadComponent: () => import('./features/field/visit.page').then((m) => m.VisitPage),
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'bookings',
        canActivate: [roleGuard('OWNER', 'COORDINATOR')],
        loadComponent: () => import('./features/bookings/bookings.page').then((m) => m.BookingsPage),
      },
      {
        path: 'bookings/new',
        canActivate: [roleGuard('OWNER', 'COORDINATOR')],
        loadComponent: () => import('./features/bookings/booking-form.page').then((m) => m.BookingFormPage),
      },
      {
        path: 'bookings/:id/edit',
        canActivate: [roleGuard('OWNER', 'COORDINATOR')],
        loadComponent: () => import('./features/bookings/booking-form.page').then((m) => m.BookingFormPage),
      },
      {
        path: 'bookings/:id',
        loadComponent: () => import('./features/bookings/booking-detail.page').then((m) => m.BookingDetailPage),
      },
      {
        path: 'calendar',
        canActivate: [roleGuard('OWNER', 'COORDINATOR')],
        loadComponent: () => import('./features/calendar/calendar.page').then((m) => m.CalendarPage),
      },
      {
        path: 'customers',
        canActivate: [roleGuard('OWNER', 'COORDINATOR')],
        loadComponent: () => import('./features/customers/customers.page').then((m) => m.CustomersPage),
      },
      {
        path: 'customers/:id',
        canActivate: [roleGuard('OWNER', 'COORDINATOR')],
        loadComponent: () => import('./features/customers/customer-detail.page').then((m) => m.CustomerDetailPage),
      },
      {
        path: 'services',
        canActivate: [roleGuard('OWNER', 'COORDINATOR')],
        loadComponent: () => import('./features/services/services.page').then((m) => m.ServicesPage),
      },
      {
        path: 'technicians',
        canActivate: [roleGuard('OWNER', 'COORDINATOR')],
        loadComponent: () => import('./features/technicians/technicians.page').then((m) => m.TechniciansPage),
      },
      {
        path: 'invoices',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), featureGuard('quotes_invoices')],
        loadComponent: () => import('./features/billing/invoices.page').then((m) => m.InvoicesPage),
      },
      {
        path: 'invoices/new',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), featureGuard('quotes_invoices')],
        data: { kind: 'invoice' },
        loadComponent: () => import('./features/billing/document-editor.page').then((m) => m.DocumentEditorPage),
      },
      {
        path: 'invoices/:id',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), featureGuard('quotes_invoices')],
        loadComponent: () => import('./features/billing/invoice-detail.page').then((m) => m.InvoiceDetailPage),
      },
      {
        path: 'quotes',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), featureGuard('quotes_invoices')],
        loadComponent: () => import('./features/billing/quotes.page').then((m) => m.QuotesPage),
      },
      {
        path: 'quotes/new',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), featureGuard('quotes_invoices')],
        data: { kind: 'quote' },
        loadComponent: () => import('./features/billing/document-editor.page').then((m) => m.DocumentEditorPage),
      },
      {
        path: 'quotes/:id/edit',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), featureGuard('quotes_invoices')],
        data: { kind: 'quote' },
        loadComponent: () => import('./features/billing/document-editor.page').then((m) => m.DocumentEditorPage),
      },
      {
        path: 'quotes/:id',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), featureGuard('quotes_invoices')],
        loadComponent: () => import('./features/billing/quote-detail.page').then((m) => m.QuoteDetailPage),
      },
      {
        path: 'messages',
        canActivate: [roleGuard('OWNER', 'COORDINATOR')],
        loadComponent: () => import('./features/messages/messages.page').then((m) => m.MessagesPage),
      },
      {
        path: 'reports',
        canActivate: [roleGuard('OWNER'), featureGuard('reports')],
        loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'users',
        canActivate: [roleGuard('OWNER')],
        loadComponent: () => import('./features/users/users.page').then((m) => m.UsersPage),
      },
      {
        path: 'settings',
        canActivate: [roleGuard('OWNER')],
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
