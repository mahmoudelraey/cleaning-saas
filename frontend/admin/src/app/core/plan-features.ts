/**
 * Same keys as the backend's PlanFeature / plans.features. Most are one page (locked in the sidebar with the
 * upgrade dialog when the plan lacks it). Trial companies get every feature.
 */
export type PlanFeatureKey =
  | 'scheduling'
  | 'customers'
  | 'booking_page'
  | 'whatsapp'
  | 'messages'
  | 'reviews'
  | 'contact_requests'
  | 'promos'
  | 'invoices'
  | 'quotes'
  | 'photos'
  | 'reports'
  | 'sales'
  | 'finance'
  | 'payroll'
  | 'branding'
  | 'priority_support';
