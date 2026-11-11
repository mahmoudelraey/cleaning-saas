export type BookingStatus = 'NEW' | 'CONFIRMED' | 'ASSIGNED' | 'ON_THE_WAY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MADA' | 'CARD' | 'APPLE_PAY' | 'ONLINE' | 'OTHER';
export type PricingType = 'FIXED' | 'HOURLY' | 'PER_SQM';

export interface Company {
  tenantId: string;
  /** Arabic name; nameEn is the English one (may be empty). */
  name: string;
  nameEn?: string;
  slug: string;
  logoUrl?: string;
  phone?: string;
  timezone: string;
  bookingOpen: boolean;
  vatRegistered: boolean;
  pricesIncludeVat: boolean;
  maxDaysAhead: number;
  leadTimeHours: number;
  cancelNoticeHours: number;
  /** Owner-written public page content; any field may be missing. */
  page?: PublicPage;
  address?: string;
  /** English address (empty = use the Arabic one). */
  addressEn?: string;
  /** The company connected its Google Maps listing (and the server has a Google key). */
  googleReviews?: boolean;
  /** The promo the company announces on its page right now, if any. */
  announcement?: Announcement;
}

/** Counted from the company's own data, for the stats band on its page. */
export interface PublicStats {
  completedVisits: number;
  technicians: number;
  /** Share of 4-5 star ratings, null without ratings. */
  satisfactionPercent: number | null;
  ratingCount: number;
}

/** A discount code shown as the bar at the top of the company page. */
export interface Announcement {
  code: string;
  title: string;
  titleEn?: string;
  discountType: 'PERCENT' | 'AMOUNT';
  /** Percent (1-100) or halalas. */
  discountValue: number;
  endsAt?: string;
  firstBookingOnly: boolean;
}

/** Live from Google Places; shown only with Google's attribution, never stored. */
export interface GooglePlace {
  placeId: string;
  name?: string;
  rating?: number;
  count?: number;
  googleMapsUri?: string;
  reviews: GoogleReview[];
}

export interface GoogleReview {
  rating: number;
  text?: string;
  textLanguage?: string;
  translated: boolean;
  relativeTime?: string;
  publishTime?: string;
  author?: { name?: string; uri?: string; photoUri?: string };
  googleMapsUri?: string;
  flagUri?: string;
}

export interface PublicPage {
  headline?: string;
  about?: string;
  /** English versions of the headline and "about us" (empty = use the Arabic). */
  headlineEn?: string;
  aboutEn?: string;
  /** English versions of the promises, service areas and working hours. */
  promisesEn?: string;
  areasEn?: string;
  hoursEn?: string;
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

/** A notification for the signed-in customer (bell in the portal header). */
export interface InboxItem {
  id: string;
  kind: string;
  bookingId?: string;
  refId?: string;
  number?: number;
  /** For TECHNICIAN_ASSIGNED: the technicians' first names. */
  actor?: string;
  createdAt: string;
  read: boolean;
}

export type ContactTopic = 'BOOKING' | 'QUESTION' | 'QUOTE' | 'COMPLAINT' | 'OTHER';

export interface ContactRequest {
  name: string;
  phone: string;
  email?: string | null;
  topic: ContactTopic;
  message: string;
  /** Honeypot: always empty from a person. */
  website?: string;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment?: string;
  name?: string;
  at: string;
}

export interface PublicReviews {
  /** Over every rating, not only the ones shown. */
  average: number;
  count: number;
  items: PublicReview[];
}

export interface MyReview {
  rating: number;
  comment?: string;
  published: boolean;
}

export interface OtpSent {
  expiresAt: string;
  resendAfterSeconds: number;
  /** Local development only. */
  devCode?: string;
}

export interface Session {
  token: string;
  expiresAt: string;
  customerId?: string;
  name?: string;
  phone: string;
  needsName: boolean;
}

export interface Technician {
  name: string;
  color?: string;
}

export interface BookingSummary {
  id: string;
  number: number;
  status: BookingStatus;
  scheduledStart: string;
  scheduledEnd: string;
  subtotalHalalas: number;
  addressText?: string;
  paymentMethod?: PaymentMethod;
  /** As saved on the booking (Arabic). */
  services: string[];
  /** Same order as `services`; null where the service has no English name. */
  servicesEn?: (string | null)[];
  technicians: Technician[];
}

export interface BookingItem {
  description: string;
  descriptionEn?: string | null;
  quantity: number;
  totalHalalas: number;
  addon: boolean;
}

export interface BookingEvent {
  type: 'CREATED' | 'STATUS_CHANGED' | 'ASSIGNED' | 'RESCHEDULED' | 'INVOICE_ISSUED';
  fromStatus?: BookingStatus;
  toStatus?: BookingStatus;
  note?: string;
  at: string;
}

export interface InvoiceRef {
  id: string;
  number: number;
  status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  totalHalalas: number;
  paidHalalas: number;
}

export interface BookingDetail {
  booking: BookingSummary;
  notes?: string;
  cancelReason?: string;
  navigationUrl?: string;
  items: BookingItem[];
  events: BookingEvent[];
  invoice?: InvoiceRef;
  canCancel: boolean;
  cancelDeadline: string;
  canReview: boolean;
  review?: MyReview;
  /** The promo the visit was booked with, and its discount. */
  promoCode?: string;
  discountHalalas?: number;
}

export interface Addon {
  id: string;
  /** Arabic (main) name. */
  name: string;
  nameEn?: string;
  priceHalalas: number;
}

export interface Service {
  id: string;
  /** The company's photo of the service (null = the portal shows a default picture). */
  imageUrl?: string | null;
  /** Arabic (main) name and description; the ...En ones may be empty. */
  name: string;
  description?: string;
  nameEn?: string;
  descriptionEn?: string;
  pricingType: PricingType;
  basePriceHalalas: number;
  durationMin: number;
  addons: Addon[];
}

export interface Item {
  serviceId: string;
  quantity?: number | null;
  addonIds?: string[];
}

export interface Quote {
  items: { serviceId?: string; addonId?: string; description: string; quantity: number; totalHalalas: number }[];
  subtotalHalalas: number;
  durationMin: number;
  /** With a promo code: what it takes off, and what is left to pay (subtotal − discount). */
  discountHalalas?: number;
  totalHalalas?: number;
  /** The promo that was applied. */
  promo?: { code: string; title: string; titleEn?: string };
  /** Why the code given does not apply (promo_not_found, promo_expired, promo_min_subtotal, ...). */
  promoError?: string;
}

export interface Slot {
  start: string;
  end: string;
}

export interface Address {
  id: string;
  label?: string;
  city?: string;
  district?: string;
  details?: string;
  mapUrl?: string;
}

export interface Profile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  addresses: Address[];
  token?: string;
  tokenExpiresAt?: string;
}

export interface NewAddress {
  city?: string | null;
  district?: string | null;
  details?: string | null;
  mapUrl?: string | null;
}

export interface Booked {
  id: string;
  number: number;
  status: BookingStatus;
  scheduledStart: string;
  scheduledEnd: string;
  subtotalHalalas: number;
}

export interface InvoiceRow {
  id: string;
  number: number;
  bookingId?: string;
  bookingNumber?: number;
  issuedAt: string;
  status: InvoiceRef['status'];
  totalHalalas: number;
  paidHalalas: number;
}
