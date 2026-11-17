package com.fieldops.app.tenant;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Feature keys stored in {@code plans.features}; the frontend uses the same strings. Most keys are one admin page
 * (locked in the sidebar with the upgrade dialog when the plan lacks it, and refused by the server).
 * Always included, whatever the plan: dashboard, calendar, bookings, customers, services, technicians, team, settings.
 *
 * <p>Default plans (V37): Starter and Basic are office-only (no customer portal and nothing that lives in it:
 * reviews, promos, contact requests); Pro adds the portal; Business adds the business pages. Each plan adds to
 * the one before; the platform admin edits them in Platform → Plans.
 *
 * <p>During the free trial a company gets every feature ({@link #DURING_TRIAL}), whatever its trial plan, so it
 * sees the full product before choosing a plan.
 */
public final class PlanFeature {

    // ---- base
    public static final String SCHEDULING = "scheduling";
    public static final String CUSTOMERS = "customers";
    /**
     * The customer portal: the company's public page ({@code /{slug}}), customer sign-in, online booking and the
     * admin app's public booking page. Without it every {@code /api/portal/{slug}/**} call answers 404.
     */
    public static final String BOOKING_PAGE = "booking_page";
    /** WhatsApp messages with a monthly cap (app.plans.limited-whatsapp-monthly); {@link #WHATSAPP} lifts it. */
    public static final String WHATSAPP_LIMITED = "whatsapp_limited";
    public static final String WHATSAPP = "whatsapp";

    // ---- pages
    public static final String MESSAGES = "messages";
    public static final String REVIEWS = "reviews";
    public static final String CONTACT_REQUESTS = "contact_requests";
    /** Promos page, and promo codes in the portal / booking page. */
    public static final String PROMOS = "promos";
    /** Invoices page, invoicing from a booking, auto-invoice. */
    public static final String INVOICES = "invoices";
    public static final String QUOTES = "quotes";
    /** Before/after visit photos. */
    public static final String PHOTOS = "photos";
    /** Analytics & reports page. */
    public static final String REPORTS = "reports";
    public static final String SALES = "sales";
    /** Finance page: P&L and expenses. */
    public static final String FINANCE = "finance";
    public static final String PAYROLL = "payroll";

    // ---- extras
    /** Company logo on invoices, quotes and public pages. */
    public static final String BRANDING = "branding";
    public static final String PRIORITY_SUPPORT = "priority_support";

    /** Every feature, in the order the plans editor shows them. */
    public static final List<String> ALL = List.of(SCHEDULING, CUSTOMERS, BOOKING_PAGE, WHATSAPP_LIMITED, WHATSAPP,
            MESSAGES, REVIEWS, CONTACT_REQUESTS, PROMOS, INVOICES, QUOTES, PHOTOS, REPORTS, SALES, FINANCE, PAYROLL,
            BRANDING, PRIORITY_SUPPORT);

    /** What every company gets while its status is TRIAL: everything (unlimited WhatsApp, so no cap). */
    public static final Set<String> DURING_TRIAL = Set.copyOf(ALL.stream()
            .filter(f -> !f.equals(WHATSAPP_LIMITED)).toList());

    private PlanFeature() {
    }

    /** The plan's features plus the trial extras when the company is on trial. */
    public static Set<String> effective(Collection<String> planFeatures, TenantStatus status) {
        Set<String> out = new LinkedHashSet<>(planFeatures == null ? Set.of() : planFeatures);
        if (status == TenantStatus.TRIAL) {
            out.addAll(DURING_TRIAL);
        }
        return out;
    }
}
