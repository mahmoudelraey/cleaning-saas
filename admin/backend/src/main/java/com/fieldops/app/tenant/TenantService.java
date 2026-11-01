package com.fieldops.app.tenant;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantService {

    public static final String DEFAULT_PLAN = "pro";

    private final TenantRepository tenants;
    private final PlanRepository plans;
    private final Clock clock;
    private final int trialDays;
    private final String defaultTimezone;

    public TenantService(TenantRepository tenants, PlanRepository plans, Clock clock,
                         @Value("${app.trial-days:14}") int trialDays,
                         @Value("${app.default-timezone:Asia/Riyadh}") String defaultTimezone) {
        this.tenants = tenants;
        this.plans = plans;
        this.clock = clock;
        this.trialDays = trialDays;
        this.defaultTimezone = defaultTimezone;
    }

    /** Creates a company on a free trial of the Pro plan (so owners see the full product while evaluating). */
    @Transactional
    public Tenant createTrialTenant(String name, String rawSlug) {
        String slug = Slugs.normalize(rawSlug);
        if (!Slugs.isValid(slug)) {
            throw ApiException.badRequest("invalid_slug", "Slug must be 3-40 lowercase letters, digits or hyphens");
        }
        if (tenants.existsBySlug(slug)) {
            throw ApiException.conflict("slug_taken", "This booking link is already taken");
        }
        Instant trialEnds = Instant.now(clock).plus(Duration.ofDays(trialDays));
        return tenants.save(Tenant.startTrial(name.trim(), slug, DEFAULT_PLAN, defaultTimezone, trialEnds));
    }

    @Transactional(readOnly = true)
    public Tenant current() {
        UUID id = TenantContext.require();
        return tenants.findById(id).orElseThrow(() -> ApiException.notFound("tenant"));
    }

    public record ProfileUpdate(String name, String phone, String vatNumber, String address,
                                String commercialRegistration, boolean pricesIncludeVat, Boolean autoInvoice) {
    }

    @Transactional
    public Tenant updateCurrent(ProfileUpdate u) {
        Tenant t = current();
        t.updateProfile(u.name().trim(), u.phone(), u.vatNumber(), u.address(), u.commercialRegistration(),
                u.pricesIncludeVat(), u.autoInvoice() == null ? t.isAutoInvoice() : u.autoInvoice());
        return t;
    }

    @Transactional
    public Tenant updateBookingPage(boolean enabled, String note) {
        Tenant t = current();
        if (enabled && !hasFeature(t, PlanFeature.BOOKING_PAGE)) {
            throw ApiException.forbidden("feature_not_in_plan", "Your plan does not include the booking page");
        }
        t.updateBookingPage(enabled, note == null || note.isBlank() ? null : note.trim());
        return t;
    }

    /** Tenant row by public slug (booking page, logo). Only usable companies are exposed. */
    @Transactional(readOnly = true)
    public Tenant bySlug(String slug) {
        return tenants.findBySlug(Slugs.normalize(slug))
                .filter(t -> t.isUsable(Instant.now(clock)))
                .orElseThrow(() -> ApiException.notFound("tenant"));
    }

    @Transactional(readOnly = true)
    public boolean hasFeature(Tenant tenant, String feature) {
        return planOf(tenant).getFeatures().contains(feature);
    }

    public Plan planOf(Tenant tenant) {
        return plans.findById(tenant.getPlanId()).orElseThrow(() -> ApiException.notFound("plan"));
    }

    @Transactional(readOnly = true)
    public List<Plan> activePlans() {
        return plans.findByActiveTrueOrderByPriceMonthlyHalalasAsc();
    }
}
