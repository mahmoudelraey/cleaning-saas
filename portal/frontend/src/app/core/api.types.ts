export type BookingStatus = 'NEW' | 'CONFIRMED' | 'ASSIGNED' | 'ON_THE_WAY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'MADA' | 'CARD' | 'APPLE_PAY' | 'ONLINE' | 'OTHER';
export type PricingType = 'FIXED' | 'HOURLY' | 'PER_SQM';

export interface Company {
  tenantId: string;
  name: string;
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
  services: string[];
  technicians: Technician[];
}

export interface BookingItem {
  description: string;
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
}

export interface Addon {
  id: string;
  name: string;
  priceHalalas: number;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
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
  items: { description: string; quantity: number; totalHalalas: number }[];
  subtotalHalalas: number;
  durationMin: number;
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
