// DTOs mirroring the Spring Boot API (com.fieldops.app.*Controller records).

/** PLATFORM_ADMIN: the FieldOps owner (Platform console); belongs to no real company. */
export type Role = 'OWNER' | 'COORDINATOR' | 'TECHNICIAN' | 'PLATFORM_ADMIN';

/** Admin screens an owner can allow per coordinator (Team page). */
export type Screen =
  | 'DASHBOARD' | 'CALENDAR' | 'BOOKINGS' | 'MESSAGES' | 'CONTACT_REQUESTS' | 'REVIEWS'
  | 'INVOICES' | 'QUOTES' | 'REPORTS' | 'SALES' | 'EXPENSES'
  | 'CUSTOMERS' | 'SERVICES' | 'TECHNICIANS';

/** Grouped as on the Team page and in the sidebar. */
export const SCREEN_GROUPS: { key: 'work' | 'finance' | 'manage'; screens: Screen[] }[] = [
  { key: 'work', screens: ['DASHBOARD', 'CALENDAR', 'BOOKINGS', 'MESSAGES', 'CONTACT_REQUESTS', 'REVIEWS'] },
  { key: 'finance', screens: ['INVOICES', 'QUOTES', 'REPORTS', 'SALES', 'EXPENSES'] },
  { key: 'manage', screens: ['CUSTOMERS', 'SERVICES', 'TECHNICIANS'] },
];

/** What a coordinator can open when the owner has not chosen: everything but the business figures (as the backend). */
export const DEFAULT_COORDINATOR_SCREENS: Screen[] = SCREEN_GROUPS.flatMap((g) => g.screens).filter(
  (s) => s !== 'REPORTS' && s !== 'SALES' && s !== 'EXPENSES',
);
export type PricingType = 'FIXED' | 'HOURLY' | 'PER_SQM';
export type DayOfWeek = 'SATURDAY' | 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';

export interface UserView {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  role: Role;
  /** Temporary password set by an owner: must be replaced before using the app. */
  mustChangePassword?: boolean;
  /** Admin screens this user may open (all for owners). */
  screens?: Screen[];
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserView;
}

export interface Plan {
  id: string;
  nameAr: string;
  nameEn: string;
  priceMonthlyHalalas: number;
  /** Optional price for a year paid up front. */
  priceYearlyHalalas?: number | null;
  maxTechnicians: number;
  /** Automatic customer messages per month; null = unlimited. */
  monthlyMessages?: number | null;
  /** Bookings per month; null = unlimited. */
  monthlyBookings?: number | null;
  features: string[];
}

export interface TenantInfo {
  id: string;
  name: string;
  nameEn?: string | null;
  slug: string;
  logoUrl?: string;
  phone?: string;
  vatNumber?: string;
  address?: string;
  /** English address shown in the portal. */
  addressEn?: string | null;
  commercialRegistration?: string;
  pricesIncludeVat: boolean;
  autoInvoice: boolean;
  bookingPageEnabled: boolean;
  bookingPageNote?: string;
  timezone: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
  trialEndsAt?: string;
  plan: Plan;
  publicPage?: PublicPage;
  google?: { available: boolean; placeId?: string; name?: string };
}

export interface GoogleCandidate {
  placeId: string;
  name?: string;
  address?: string;
}

/** Owner-written content of the public page in the customer portal. Empty fields hide their section. */
export interface PublicPage {
  headline?: string;
  about?: string;
  /** English versions of the headline and "about us". */
  headlineEn?: string;
  aboutEn?: string;
  /** English versions of the promises, service areas and working hours. */
  promisesEn?: string;
  areasEn?: string;
  hoursEn?: string;
  /** The big title at the top of the page; a line break splits it into two lines. Empty → the default title. */
  heroTitle?: string;
  heroTitleEn?: string;
  areas?: string;
  hours?: string;
  /** E.164 */
  whatsapp?: string;
  instagram?: string;
  x?: string;
  snapchat?: string;
  tiktok?: string;
  foundedYear?: number;
  teamSize?: number;
  /** One per line. */
  promises?: string;
  /** Page name, or digits for a profile.php?id= page. */
  facebook?: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface CustomerSummary extends Audited {
  id: string;
  name: string;
  phone: string;
  email?: string;
  createdAt: string;
}

export interface Address {
  id: string;
  label: string;
  city?: string;
  district?: string;
  cityId?: number;
  districtId?: number;
  details?: string;
  lat?: number;
  lng?: number;
  mapUrl?: string;
  navigationUrl?: string;
}

export interface CustomerDetail extends CustomerSummary {
  notes?: string;
  addresses: Address[];
}

export interface Addon {
  id: string;
  /** Arabic (main) name. */
  name: string;
  nameEn?: string;
  priceHalalas: number;
  active: boolean;
}

/** A choice within a service with its own price, e.g. car wash → small / medium / large car. */
export interface ServiceOption {
  id: string;
  /** Arabic (main) name. */
  name: string;
  nameEn?: string;
  priceHalalas: number;
  /** Minutes for one unit; null = the service's duration. */
  durationMin?: number | null;
  active: boolean;
}

/** Who created / last changed a record and when; a null ...By means the system or a customer. */
export interface AuditInfo {
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
}

/** List items carry their audit info. */
export interface Audited {
  audit?: AuditInfo | null;
}

export interface ServiceOffering extends Audited {
  id: string;
  /** Arabic (main) name and description. */
  name: string;
  description?: string;
  nameEn?: string;
  descriptionEn?: string;
  pricingType: PricingType;
  basePriceHalalas: number;
  durationMin: number;
  active: boolean;
  addons: Addon[];
  /** When a service has active options, the customer must choose one and its price replaces the base price. */
  options: ServiceOption[];
  /** The service's photo (null = the default picture is shown). */
  imageUrl?: string | null;
}

export interface WorkShift {
  day: DayOfWeek;
  start: string;
  end: string;
}

export interface Technician extends Audited {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email?: string;
  skills: string[];
  workHours: WorkShift[];
  color: string;
  active: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  /** Average customer rating (1–5) of the visits they did; null until one is rated. */
  ratingAverage?: number | null;
  ratingCount?: number;
}

export interface StaffUser extends Audited {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: Role;
  active: boolean;
  lastLoginAt?: string;
  mustChangePassword?: boolean;
  /** Admin screens this user may open (all for owners). */
  screens?: Screen[];
}

/** RFC 9457 problem+json returned by GlobalExceptionHandler. */
export interface ApiProblem {
  status: number;
  detail?: string;
  code?: string;
  fields?: Record<string, string>;
}

// --- Bookings & scheduling (week 3) ---------------------------------------------------------------

export type BookingStatus =
  | 'NEW'
  | 'CONFIRMED'
  | 'ASSIGNED'
  | 'ON_THE_WAY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';
export type BookingSource = 'MANUAL' | 'PUBLIC_PAGE' | 'PORTAL';

export interface TechnicianRef {
  id: string;
  name: string;
  color: string;
}

export interface BookingSummary extends Audited {
  id: string;
  number: number;
  status: BookingStatus;
  source: BookingSource;
  scheduledStart: string;
  scheduledEnd: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  addressText?: string;
  subtotalHalalas: number;
  technicians: TechnicianRef[];
  /** How the customer will pay; null when not set (e.g. booking-page orders). */
  paymentMethod?: PaymentMethod | null;
  /** Names of the main services on the booking (list endpoints only). */
  services?: string[];
  /** Promo or accepted-quote discount, and the amount after it (before VAT). */
  discountHalalas?: number;
  totalHalalas?: number;
  /** When the request was made. */
  createdAt?: string;
}

export interface BookingItem {
  serviceId: string;
  addonId?: string;
  optionId?: string;
  description: string;
  quantity: number;
  unitPriceHalalas: number;
  totalHalalas: number;
}

export interface VisitEvent {
  id: string;
  type: 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNED' | 'UNASSIGNED' | 'RESCHEDULED' | 'UPDATED' | 'NOTE' | 'PHOTO_ADDED' | 'INVOICE_ISSUED';
  fromStatus?: BookingStatus;
  toStatus?: BookingStatus;
  note?: string;
  actorName?: string;
  at: string;
}

export interface BookingDetail extends BookingSummary {
  /** Automatic invoice progress: PENDING = queued for the background job. */
  invoiceState?: 'NONE' | 'PENDING' | 'ISSUED' | 'FAILED';
  invoiceError?: string;
  addressId?: string;
  navigationUrl?: string;
  notes?: string;
  internalNotes?: string;
  cancelReason?: string;
  completedAt?: string;
  items: BookingItem[];
  events: VisitEvent[];
  allowedTransitions: BookingStatus[];
  createdAt: string;
  /** The promo code the customer booked with (portal), and what it takes off the subtotal. */
  promoCode?: string | null;
  discountHalalas?: number;
}

export interface BookingLineInput {
  serviceId: string;
  /** Required when the service has active options. */
  optionId?: string | null;
  quantity?: number | null;
  addonIds?: string[];
}

export interface BookingInput {
  customerId: string;
  addressId?: string | null;
  scheduledStart: string;
  durationMin?: number | null;
  items: BookingLineInput[];
  notes?: string | null;
  internalNotes?: string | null;
  technicianIds?: string[];
  force?: boolean;
  paymentMethod?: PaymentMethod | null;
}

export interface PricePreview {
  items: BookingItem[];
  subtotalHalalas: number;
  durationMin: number;
}

export interface Slot {
  start: string;
  end: string;
  capacity: number;
  freeTechnicianIds: string[];
}

export interface CalendarData {
  technicians: { id: string; name: string; color: string; active: boolean }[];
  bookings: {
    id: string;
    number: number;
    status: BookingStatus;
    start: string;
    end: string;
    customerName: string;
    addressText?: string;
    subtotalHalalas: number;
    technicianIds: string[];
  }[];
}

// --- Notifications (week 5) -------------------------------------------------------------------------

export type NotificationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SKIPPED';

export interface NotificationLog extends Audited {
  id: string;
  bookingId?: string;
  template: string;
  channel?: 'WHATSAPP' | 'SMS' | 'LOG';
  /** Provider that carried (or last tried) it, e.g. META_WHATSAPP, TAQNYAT_SMS. */
  provider?: string;
  toPhone: string;
  body: string;
  status: NotificationStatus;
  error?: string;
  attempts: number;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
}

export interface NotificationSettings {
  confirmation: boolean;
  reminder: boolean;
  onTheWay: boolean;
  completed: boolean;
  cancelled: boolean;
  reminderHours: number;
  whatsappConfigured?: boolean;
  smsConfigured?: boolean;
}

// ---------------------------------------------------------------------------------------- billing

export type InvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MADA' | 'CARD' | 'APPLE_PAY' | 'ONLINE' | 'OTHER';

export interface DocumentLine {
  description: string;
  quantity: number;
  unitPriceHalalas: number;
  totalHalalas: number;
  /** The catalog service / add-on the line was priced from (absent for free-text lines). */
  serviceId?: string;
  addonId?: string;
  optionId?: string;
}

/** A line as sent to the API: a catalog service (priced by the server) or free text with a price. */
export interface LineInput {
  serviceId?: string;
  optionId?: string | null;
  quantity?: number;
  addonIds?: string[];
  description?: string;
  unitPriceHalalas?: number;
  /** On a free-text line: the catalog service / add-on it was first priced from. */
  catalogServiceId?: string;
  catalogAddonId?: string;
  catalogOptionId?: string;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amountHalalas: number;
  reference?: string;
  paidAt: string;
}

export interface QrPath {
  size: number;
  d: string;
}

export interface InvoiceSummary extends Audited {
  id: string;
  number: number;
  status: InvoiceStatus;
  customerId: string;
  customerName: string;
  issuedAt: string;
  dueDate?: string;
  totalHalalas: number;
  paidHalalas: number;
  bookingId?: string;
}

export interface Invoice {
  id: string;
  number: number;
  status: InvoiceStatus;
  vatInvoice: boolean;
  bookingId?: string;
  quoteId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerVatNumber?: string;
  sellerName: string;
  sellerVatNumber?: string;
  sellerAddress?: string;
  sellerCr?: string;
  issuedAt: string;
  dueDate?: string;
  pricesIncludeVat: boolean;
  vatRateBp: number;
  lines: DocumentLine[];
  linesTotalHalalas: number;
  discountHalalas: number;
  taxableHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  paidHalalas: number;
  balanceHalalas: number;
  notes?: string;
  voidReason?: string;
  voidedAt?: string;
  zatcaQr?: string;
  zatcaQrPath?: QrPath;
  payments: Payment[];
  publicUrl?: string;
}

export interface QuoteSummary extends Audited {
  id: string;
  number: number;
  status: QuoteStatus;
  customerId: string;
  customerName: string;
  createdAt: string;
  validUntil: string;
  totalHalalas: number;
  expired: boolean;
}

export interface Quote {
  id: string;
  number: number;
  status: QuoteStatus;
  expired: boolean;
  bookingId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  validUntil: string;
  pricesIncludeVat: boolean;
  vatRateBp: number;
  lines: DocumentLine[];
  linesTotalHalalas: number;
  discountHalalas: number;
  taxableHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  notes?: string;
  respondedAt?: string;
  publicUrl?: string;
  invoiceId?: string;
}

export interface PublicCompany {
  name: string;
  slug: string;
  logoUrl?: string;
  phone?: string;
  vatNumber?: string;
  address?: string;
  commercialRegistration?: string;
  timezone: string;
  /** The company's plan includes the customer portal (show the "my bookings" link). */
  portal?: boolean;
}

export interface PublicInvoice {
  company: PublicCompany;
  invoice: Invoice;
}

export interface PublicQuote {
  company: PublicCompany;
  quote: Quote;
}

// ------------------------------------------------------------------------------- public booking page

export interface PublicService {
  id: string;
  name: string;
  description?: string;
  pricingType: PricingType;
  basePriceHalalas: number;
  durationMin: number;
  addons: { id: string; name: string; priceHalalas: number }[];
  options: { id: string; name: string; priceHalalas: number; durationMin?: number | null }[];
}

export interface PublicBookingPage {
  name: string;
  slug: string;
  logoUrl?: string;
  phone?: string;
  note?: string;
  timezone: string;
  vatRegistered: boolean;
  pricesIncludeVat: boolean;
  maxDaysAhead: number;
  leadTimeHours: number;
  services: PublicService[];
}

export interface PublicItem {
  serviceId: string;
  optionId?: string | null;
  quantity?: number;
  addonIds?: string[];
}

export interface PublicQuoteResult {
  items: { description: string; quantity: number; totalHalalas: number }[];
  subtotalHalalas: number;
  durationMin: number;
}

export interface PublicSlot {
  start: string;
  end: string;
}

export interface OtpSent {
  expiresAt: string;
  resendAfterSeconds: number;
  devCode?: string;
}

export interface PublicBooked {
  number: number;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  subtotalHalalas: number;
}

// ------------------------------------------------------------------------------------------- reports

export interface ReportSummary {
  from: string;
  to: string;
  bookings: {
    total: number;
    completed: number;
    cancelled: number;
    noShow: number;
    open: number;
    fromBookingPage: number;
    byStatus: Record<string, number>;
    completedValueHalalas: number;
  };
  revenue: {
    invoicedHalalas: number;
    vatHalalas: number;
    invoiceCount: number;
    collectedHalalas: number;
    outstandingHalalas: number;
    averageTicketHalalas: number;
  };
  customers: { newCustomers: number; active: number; returning: number };
  daily: { date: string; bookings: number; completed: number; invoicedHalalas: number; collectedHalalas: number }[];
  topServices: { serviceId: string; name: string; bookings: number; revenueHalalas: number }[];
  technicians: {
    technicianId: string;
    name: string;
    color: string;
    visits: number;
    completed: number;
    noShow: number;
    hours: number;
    completedValueHalalas: number;
  }[];
}

// ---- Promotions ----
export type DiscountType = 'PERCENT' | 'AMOUNT';

/** A discount code. discountValue is a percent (1-100) for PERCENT, halalas for AMOUNT. */
export interface Promo extends Audited {
  id: string;
  code: string;
  title: string;
  titleEn?: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountHalalas?: number | null;
  minSubtotalHalalas: number;
  startsAt?: string | null;
  /** The moment it stops working (exclusive). */
  endsAt?: string | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  firstBookingOnly: boolean;
  active: boolean;
  announce: boolean;
  /** Bookings that used it (cancelled ones not counted). */
  usedCount: number;
  createdAt: string;
}
