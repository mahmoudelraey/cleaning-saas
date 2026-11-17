package com.fieldops.app.tenant;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Feature keys stored in {@code plans.features} (see V1 migration). The frontend uses the same strings.
 *
 * <p>Basic: scheduling, customers, booking_page, whatsapp_limited.
 * Pro: + whatsapp (unlimited), quotes_invoices, photos, reports.
 * Business: + online_payments, branding, priority_support.
 *
 * <p>During the free trial a company also gets {@link #DURING_TRIAL} on top of its trial plan, so it can set
 * itself up (e.g. upload its logo) before choosing a plan.
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

    /** Extra features every company gets while its status is TRIAL, whatever the trial plan. */
    public static final Set<String> DURING_TRIAL = Set.of(BRANDING);

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
