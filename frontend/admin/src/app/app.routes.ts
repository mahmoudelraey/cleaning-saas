import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { AuthService } from './core/auth/auth.service';

import { authGuard, guestGuard, passwordChangedGuard, roleGuard, screenGuard } from './core/auth/auth.guards';
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
        // Technicians land on their day; office staff on the first screen they may open.
        redirectTo: () => inject(AuthService).homePath().replace(/^\//, ''),
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
        canActivate: [screenGuard('DASHBOARD')],
        loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'bookings',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('BOOKINGS')],
        loadComponent: () => import('./features/bookings/bookings.page').then((m) => m.BookingsPage),
      },
      {
        path: 'bookings/new',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('BOOKINGS', 'CALENDAR')],
        loadComponent: () => import('./features/bookings/booking-form.page').then((m) => m.BookingFormPage),
      },
      {
        path: 'bookings/:id/edit',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('BOOKINGS', 'CALENDAR')],
        loadComponent: () => import('./features/bookings/booking-form.page').then((m) => m.BookingFormPage),
      },
      {
        path: 'bookings/:id',
        canActivate: [screenGuard('BOOKINGS', 'CALENDAR', 'CUSTOMERS', 'DASHBOARD')],
        loadComponent: () => import('./features/bookings/booking-detail.page').then((m) => m.BookingDetailPage),
      },
      {
        path: 'calendar',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('CALENDAR')],
        loadComponent: () => import('./features/calendar/calendar.page').then((m) => m.CalendarPage),
      },
      {
        path: 'customers',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('CUSTOMERS')],
        loadComponent: () => import('./features/customers/customers.page').then((m) => m.CustomersPage),
      },
      {
        path: 'customers/:id',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('CUSTOMERS')],
        loadComponent: () => import('./features/customers/customer-detail.page').then((m) => m.CustomerDetailPage),
      },
      {
        path: 'services',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('SERVICES')],
        loadComponent: () => import('./features/services/services.page').then((m) => m.ServicesPage),
      },
      {
        // Discount codes; managing them is part of managing prices, so the Services screen opens it.
        path: 'promos',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('SERVICES')],
        loadComponent: () => import('./features/promos/promos.page').then((m) => m.PromosPage),
      },
      {
        path: 'technicians',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('TECHNICIANS')],
        loadComponent: () => import('./features/technicians/technicians.page').then((m) => m.TechniciansPage),
      },
      {
        path: 'invoices',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('INVOICES'), featureGuard('quotes_invoices')],
        loadComponent: () => import('./features/billing/invoices.page').then((m) => m.InvoicesPage),
      },
      {
        path: 'invoices/new',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('INVOICES'), featureGuard('quotes_invoices')],
        data: { kind: 'invoice' },
        loadComponent: () => import('./features/billing/document-editor.page').then((m) => m.DocumentEditorPage),
      },
      {
        path: 'invoices/:id',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('INVOICES'), featureGuard('quotes_invoices')],
        loadComponent: () => import('./features/billing/invoice-detail.page').then((m) => m.InvoiceDetailPage),
      },
      {
        path: 'quotes',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('QUOTES'), featureGuard('quotes_invoices')],
        loadComponent: () => import('./features/billing/quotes.page').then((m) => m.QuotesPage),
      },
      {
        path: 'quotes/new',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('QUOTES'), featureGuard('quotes_invoices')],
        data: { kind: 'quote' },
        loadComponent: () => import('./features/billing/document-editor.page').then((m) => m.DocumentEditorPage),
      },
      {
        path: 'quotes/:id/edit',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('QUOTES'), featureGuard('quotes_invoices')],
        data: { kind: 'quote' },
        loadComponent: () => import('./features/billing/document-editor.page').then((m) => m.DocumentEditorPage),
      },
      {
        path: 'quotes/:id',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('QUOTES'), featureGuard('quotes_invoices')],
        loadComponent: () => import('./features/billing/quote-detail.page').then((m) => m.QuoteDetailPage),
      },
      {
        path: 'messages',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('MESSAGES')],
        loadComponent: () => import('./features/messages/messages.page').then((m) => m.MessagesPage),
      },
      {
        path: 'contact-requests',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('CONTACT_REQUESTS')],
        loadComponent: () => import('./features/contact/contact-requests.page').then((m) => m.ContactRequestsPage),
      },
      {
        path: 'reviews',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('REVIEWS')],
        loadComponent: () => import('./features/reviews/reviews.page').then((m) => m.ReviewsPage),
      },
      {
        path: 'reports',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('REPORTS'), featureGuard('reports')],
        loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'sales',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('SALES'), featureGuard('reports')],
        loadComponent: () => import('./features/sales/sales.page').then((m) => m.SalesPage),
      },
      {
        path: 'finance',
        canActivate: [roleGuard('OWNER', 'COORDINATOR'), screenGuard('EXPENSES'), featureGuard('reports')],
        loadComponent: () => import('./features/finance/finance.page').then((m) => m.FinancePage),
      },
      {
        path: 'payroll',
        canActivate: [roleGuard('OWNER'), featureGuard('reports')],
        loadComponent: () => import('./features/payroll/payroll.page').then((m) => m.PayrollPage),
      },
      // FieldOps owner's console.
      {
        path: 'platform',
        canActivate: [roleGuard('PLATFORM_ADMIN')],
        loadComponent: () => import('./features/platform/overview.page').then((m) => m.PlatformOverviewPage),
      },
      {
        path: 'platform/companies',
        canActivate: [roleGuard('PLATFORM_ADMIN')],
        loadComponent: () => import('./features/platform/companies.page').then((m) => m.PlatformCompaniesPage),
      },
      {
        path: 'platform/plans',
        canActivate: [roleGuard('PLATFORM_ADMIN')],
        loadComponent: () => import('./features/platform/plans.page').then((m) => m.PlatformPlansPage),
      },
      {
        path: 'platform/settings',
        canActivate: [roleGuard('PLATFORM_ADMIN')],
        loadComponent: () => import('./features/platform/settings.page').then((m) => m.PlatformSettingsPage),
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
