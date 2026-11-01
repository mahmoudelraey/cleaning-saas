package com.fieldops.app.tenant;

/**
 * Feature keys stored in {@code plans.features} (see V1 migration). The frontend uses the same strings.
 *
 * <p>Basic: scheduling, customers, booking_page, whatsapp_limited.
 * Pro: + whatsapp (unlimited), quotes_invoices, photos, reports.
 * Business: + online_payments, branding, priority_support.
 */
public final class PlanFeature {

    public static final String SCHEDULING = "scheduling";
    public static final String CUSTOMERS = "customers";
    public static final String BOOKING_PAGE = "booking_page";
    public static final String WHATSAPP = "whatsapp";
    public static final String WHATSAPP_LIMITED = "whatsapp_limited";
    public static final String QUOTES_INVOICES = "quotes_invoices";
    public static final String PHOTOS = "photos";
    public static final String REPORTS = "reports";
    public static final String ONLINE_PAYMENTS = "online_payments";
    public static final String BRANDING = "branding";
    public static final String PRIORITY_SUPPORT = "priority_support";

    private PlanFeature() {
    }
}
