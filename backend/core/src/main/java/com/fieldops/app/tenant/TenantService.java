package com.fieldops.app.tenant;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.platform.PlatformSettingsService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantService {

    public static final String DEFAULT_PLAN = "pro";

    private final TenantRepository tenants;
    private final PlanRepository plans;
    private final Clock clock;
    private final PlatformSettingsService platform;
    private final String defaultTimezone;

    public TenantService(TenantRepository tenants, PlanRepository plans, Clock clock, PlatformSettingsService platform,
                         @Value("${app.default-timezone:Asia/Riyadh}") String defaultTimezone) {
        this.tenants = tenants;
        this.plans = plans;
        this.clock = clock;
        this.platform = platform;
        this.defaultTimezone = defaultTimezone;
    }

    /**
     * Creates a company on a free trial. Length and plan are set by the platform owner (Platform → Settings);
     * by default 14 days of Pro, so owners see the full product while evaluating.
     */
    @Transactional
    public Tenant createTrialTenant(String name, String rawSlug) {
        return createTrialTenant(name, null, rawSlug);
    }

    /** @param nameEn the company's English name (null = none) */
    @Transactional
    public Tenant createTrialTenant(String name, String nameEn, String rawSlug) {
        String slug = Slugs.normalize(rawSlug);
        if (!Slugs.isValid(slug)) {
            throw ApiException.badRequest("invalid_slug", "Slug must be 3-40 lowercase letters, digits or hyphens");
        }
        if (tenants.existsBySlug(slug)) {
            throw ApiException.conflict("slug_taken", "This booking link is already taken");
        }
        Instant trialEnds = Instant.now(clock).plus(Duration.ofDays(platform.trialDays()));
        String planId = plans.existsById(platform.trialPlanId()) ? platform.trialPlanId() : DEFAULT_PLAN;
        String en = nameEn == null || nameEn.isBlank() ? null : nameEn.trim();
        return tenants.save(Tenant.startTrial(name.trim(), en, slug, planId, defaultTimezone, trialEnds));
    }

    @Transactional(readOnly = true)
    public Tenant current() {
        UUID id = TenantContext.require();
        return tenants.findById(id).orElseThrow(() -> ApiException.notFound("tenant"));
    }

    /** @param nameEn null leaves the English name as it is; blank clears it */
    public record ProfileUpdate(String name, String phone, String vatNumber, String address,
                                String commercialRegistration, boolean pricesIncludeVat, Boolean autoInvoice,
                                String nameEn) {
        public ProfileUpdate(String name, String phone, String vatNumber, String address,
                             String commercialRegistration, boolean pricesIncludeVat, Boolean autoInvoice) {
            this(name, phone, vatNumber, address, commercialRegistration, pricesIncludeVat, autoInvoice, null);
        }
    }

    @Transactional
    public Tenant updateCurrent(ProfileUpdate u) {
        Tenant t = current();
        t.updateProfile(u.name().trim(), u.phone(), u.vatNumber(), u.address(), u.commercialRegistration(),
                u.pricesIncludeVat(), u.autoInvoice() == null ? t.isAutoInvoice() : u.autoInvoice());
        if (u.nameEn() != null) {
            t.renameEn(u.nameEn().isBlank() ? null : u.nameEn().trim());
        }
        return t;
    }

    /**
     * Changes the company link ({portal}/{slug}, /book/{slug}). Links shared before stop working, and signed-in
     * portal customers have to sign in again (their token is bound to the old link).
     */
    @Transactional
    public Tenant changeSlug(String rawSlug) {
        Tenant t = current();
        String slug = Slugs.normalize(rawSlug);
        if (slug != null && slug.equals(t.getSlug())) {
            return t;
        }
        if (!Slugs.isValid(slug)) {
            throw ApiException.badRequest("invalid_slug", "Slug must be 3-40 lowercase letters, digits or hyphens");
        }
        if (tenants.existsBySlug(slug)) {
            throw ApiException.conflict("slug_taken", "This booking link is already taken");
        }
        t.changeSlug(slug);
        return t;
    }

    /** Owner-written content of the public page; blanks are stored as empty (hidden on the page). */
    @Transactional
    public Tenant updatePublicPage(PublicPage p) {
        Tenant t = current();
        t.updatePublicPage(new PublicPage(clean(p.headline()), clean(p.about()), clean(p.areas()), clean(p.hours()),
                null, null, null, null, null, p.foundedYear(), p.teamSize(), clean(p.promises()), null));
        return t;
    }

    public record ContactDetails(String phone, String whatsapp, String facebook, String instagram, String tiktok,
                                 String snapchat, String x) {
    }

    /** Mobile (already normalized), WhatsApp and social accounts; links and @ are reduced to the account name. */
    @Transactional
    public Tenant updateContact(ContactDetails c) {
        Tenant t = current();
        t.updateContact(clean(c.phone()), clean(c.whatsapp()), facebook(c.facebook()), handle(c.instagram()),
                handle(c.tiktok()), handle(c.snapchat()), handle(c.x()));
        return t;
    }

    /** Facebook links come as facebook.com/name or facebook.com/profile.php?id=123; keep "name" or "123". */
    static String facebook(String s) {
        String v = clean(s);
        if (v == null) {
            return null;
        }
        Matcher id = Pattern.compile("[?&]id=(\\d+)").matcher(v);
        if (id.find()) {
            return id.group(1);
        }
        v = v.replaceFirst("(?i)^https?://", "").replaceFirst("(?i)^(www\\.|m\\.|web\\.)?(facebook|fb)\\.(com|me)/", "");
        v = v.replaceFirst("(?i)^pg/", "").replaceFirst("[/?#].*$", "").replaceFirst("^@", "");
        if (v.isBlank()) {
            return null;
        }
        if (!v.matches("[A-Za-z0-9._-]{1,100}")) {
            throw ApiException.badRequest("invalid_handle", "Enter the page name or paste the page link");
        }
        return v;
    }

    /** Links the company to its Google Maps listing (null placeId disconnects it). */
    @Transactional
    public Tenant connectGoogle(String placeId, String placeName) {
        Tenant t = current();
        t.connectGoogle(clean(placeId), clean(placeName));
        return t;
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** Accepts "name", "@name" or a pasted profile link and keeps just the account name. */
    static String handle(String s) {
        String v = clean(s);
        if (v == null) {
            return null;
        }
        v = v.replaceFirst("(?i)^https?://", "").replaceFirst("(?i)^(www\\.)?[a-z0-9.-]+\\.[a-z]{2,}/", "");
        v = v.replaceFirst("^@", "").replaceFirst("^add/", "").replaceFirst("[/?#].*$", "").replaceFirst("^@", "");
        if (v.isBlank()) {
            return null;
        }
        if (!v.matches("[A-Za-z0-9._-]{1,60}")) {
            throw ApiException.badRequest("invalid_handle", "Enter the account name, e.g. clean.pro");
        }
        return v;
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
                .filter(t -> !t.isPlatform() && t.isUsable(Instant.now(clock)))
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
        return plans.findByActiveTrueOrderBySortOrderAscPriceMonthlyHalalasAsc();
    }
}
