package com.fieldops.app.platform;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import com.fieldops.app.auth.UserRepository;
import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.notification.NotificationTemplate;
import com.fieldops.app.notification.channel.MessageChannel;
import com.fieldops.app.notification.channel.NotificationProperties;
import com.fieldops.app.notification.channel.UnifonicSmsChannel;
import com.fieldops.app.tenant.Plan;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.PlanFeatureService;
import com.fieldops.app.tenant.PlanRepository;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantAccessService;
import com.fieldops.app.tenant.TenantRepository;
import com.fieldops.app.tenant.TenantStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * The FieldOps owner's console: companies and their subscriptions, plans and prices, platform settings and
 * messaging credentials. Works across all companies; only PLATFORM_ADMIN reaches it (PlatformController). The
 * tables it touches (tenants, plans, users, platform_*) have no row-level security.
 */
@Service
public class PlatformService {

    /** Dates entered in the console are Saudi days. */
    static final ZoneId ZONE = ZoneId.of("Asia/Riyadh");
    private static final Pattern PLAN_ID = Pattern.compile("[a-z][a-z0-9_-]{1,29}");
    public static final List<String> FEATURES = List.of(PlanFeature.SCHEDULING, PlanFeature.CUSTOMERS,
            PlanFeature.BOOKING_PAGE, PlanFeature.WHATSAPP_LIMITED, PlanFeature.WHATSAPP, PlanFeature.QUOTES_INVOICES,
            PlanFeature.PHOTOS, PlanFeature.REPORTS, PlanFeature.ONLINE_PAYMENTS, PlanFeature.BRANDING,
            PlanFeature.PRIORITY_SUPPORT);

    private final TenantRepository tenants;
    private final PlanRepository plans;
    private final UserRepository users;
    private final PlatformSettingsService settings;
    private final TenantAccessService access;
    private final PlanFeatureService planFeatures;
    private final UnifonicSmsChannel sms;
    private final JdbcTemplate jdbc;
    private final RestClient http;
    private final Clock clock;

    public PlatformService(TenantRepository tenants, PlanRepository plans, UserRepository users,
                           PlatformSettingsService settings, TenantAccessService access,
                           PlanFeatureService planFeatures, UnifonicSmsChannel sms, JdbcTemplate jdbc,
                           RestClient.Builder http, Clock clock) {
        this.tenants = tenants;
        this.plans = plans;
        this.users = users;
        this.settings = settings;
        this.access = access;
        this.planFeatures = planFeatures;
        this.sms = sms;
        this.jdbc = jdbc;
        this.http = http.build();
        this.clock = clock;
    }

    // =============================================================================================
    // DTOs
    // =============================================================================================

    public record CompanyRow(UUID id, String name, String slug, String planId, String status, boolean usable,
                             Instant trialEndsAt, Instant paidUntil, String billingCycle, String statusNote,
                             Instant createdAt, String ownerName, String ownerPhone, String ownerEmail, int users,
                             Instant lastLoginAt) {
    }

    public record StaffRow(UUID id, String name, String phone, String email, Role role, boolean active,
                           Instant lastLoginAt) {
    }

    public record AuditRow(String action, String details, String actorName, Instant at) {
    }

    public record CompanyDetail(CompanyRow company, List<StaffRow> staff, List<AuditRow> history) {
    }

    public record PlanCount(String planId, long companies) {
    }

    public record Overview(long companies, long trials, long trialsExpired, long trialsEndingSoon, long active,
                           long pastDue, long suspended, long cancelled, long newLast30Days,
                           long monthlyRecurringHalalas, List<PlanCount> byPlan, List<CompanyRow> endingSoon) {
    }

    public record PlanRow(String id, String nameAr, String nameEn, long priceMonthlyHalalas,
                          Long priceYearlyHalalas, int maxTechnicians, List<String> features, boolean active,
                          int sortOrder, long companies) {
    }

    public record PlanData(String id, String nameAr, String nameEn, long priceMonthlyHalalas,
                           Long priceYearlyHalalas, int maxTechnicians, List<String> features, boolean active,
                           int sortOrder) {
    }

    public record General(int trialDays, String trialPlanId, int graceDays, String supportWhatsapp,
                          String supportEmail) {
    }

    /** Secret values are never returned: only whether one is saved and its last 4 characters. */
    public record Secret(boolean set, String hint) {
    }

    public record MessagingView(boolean configured, boolean whatsappEnabled, String whatsappApiUrl,
                                String whatsappApiVersion, String whatsappPhoneNumberId,
                                String whatsappBusinessAccountId, Secret whatsappAccessToken,
                                Secret whatsappAppSecret, Secret whatsappVerifyToken, String whatsappLanguage,
                                Map<String, String> whatsappTemplates, boolean smsEnabled, String smsApiUrl,
                                Secret smsAppSid, String smsSenderId, String webhookPath, List<String> templateKeys,
                                boolean whatsappReady, boolean smsReady, Instant updatedAt) {
    }

    /** Secrets: null = keep the saved one, "" = clear, anything else = replace. */
    public record MessagingData(boolean whatsappEnabled, String whatsappApiUrl, String whatsappApiVersion,
                                String whatsappPhoneNumberId, String whatsappBusinessAccountId,
                                String whatsappAccessToken, String whatsappAppSecret, String whatsappVerifyToken,
                                String whatsappLanguage, Map<String, String> whatsappTemplates, boolean smsEnabled,
                                String smsApiUrl, String smsAppSid, String smsSenderId) {
    }

    public record TestResult(boolean ok, String message) {
    }

    // =============================================================================================
    // Companies
    // =============================================================================================

    private static final String COMPANY_SQL = """
            select t.id, t.name, t.slug, t.plan_id, t.status, t.trial_ends_at, t.paid_until, t.billing_cycle,
                   t.status_note, t.created_at, o.name as owner_name, o.phone as owner_phone, o.email as owner_email,
                   (select count(*) from users u where u.tenant_id = t.id and u.active) as user_count,
                   (select max(u.last_login_at) from users u where u.tenant_id = t.id) as last_login
            from tenants t
            left join lateral (select u.name, u.phone, u.email from users u
                               where u.tenant_id = t.id and u.role = 'OWNER' order by u.created_at limit 1) o on true
            where not t.platform
            """;

    /**
     * @param status a tenant status, or TRIAL_EXPIRED / ENDING_SOON (trial ends within 7 days)
     */
    @Transactional(readOnly = true)
    public List<CompanyRow> companies(String q, String status) {
        StringBuilder sql = new StringBuilder(COMPANY_SQL);
        List<Object> args = new ArrayList<>();
        if (q != null && !q.isBlank()) {
            String like = "%" + q.trim().toLowerCase() + "%";
            String digits = PhoneNumbers.toAsciiDigits(q.trim()).replaceAll("\\D", "");
            sql.append(" and (lower(t.name) like ? or t.slug like ? or lower(coalesce(o.email, '')) like ?");
            args.add(like);
            args.add(like);
            args.add(like);
            if (digits.length() >= 4) {
                sql.append(" or o.phone like ?");
                args.add("%" + (digits.startsWith("0") ? digits.substring(1) : digits) + "%");
            }
            sql.append(")");
        }
        Timestamp now = Timestamp.from(Instant.now(clock));
        if ("TRIAL_EXPIRED".equals(status)) {
            sql.append(" and t.status = 'TRIAL' and t.trial_ends_at <= ?");
            args.add(now);
        } else if ("ENDING_SOON".equals(status)) {
            sql.append(" and t.status = 'TRIAL' and t.trial_ends_at > ? and t.trial_ends_at <= ?");
            args.add(now);
            args.add(Timestamp.from(Instant.now(clock).plus(Duration.ofDays(7))));
        } else if (status != null && !status.isBlank()) {
            try {
                TenantStatus.valueOf(status);
            } catch (IllegalArgumentException e) {
                throw ApiException.badRequest("invalid_status", "Unknown status");
            }
            sql.append(" and t.status = ?");
            args.add(status);
        }
        sql.append(" order by t.created_at desc limit 500");
        return jdbc.query(sql.toString(), (rs, i) -> row(rs), args.toArray());
    }

    @Transactional(readOnly = true)
    public CompanyDetail company(UUID id) {
        List<CompanyRow> rows = jdbc.query(COMPANY_SQL + " and t.id = ?", (rs, i) -> row(rs), id);
        if (rows.isEmpty()) {
            throw ApiException.notFound("tenant");
        }
        List<StaffRow> staff = users.findByTenantIdOrderByNameAsc(id).stream()
                .map(u -> new StaffRow(u.getId(), u.getName(), u.getPhone(), u.getEmail(), u.getRole(), u.isActive(),
                        u.getLastLoginAt()))
                .toList();
        List<AuditRow> history = jdbc.query("""
                        select action, details, actor_name, created_at from platform_audit
                        where tenant_id = ? order by created_at desc limit 50""",
                (rs, i) -> new AuditRow(rs.getString(1), rs.getString(2), rs.getString(3), instant(rs.getTimestamp(4))),
                id);
        return new CompanyDetail(rows.get(0), staff, history);
    }

    @Transactional
    public CompanyDetail changePlan(UUID id, String planId) {
        Tenant t = tenant(id);
        Plan p = plan(planId);
        String before = t.getPlanId();
        t.changePlan(p.getId());
        return done(t, "PLAN_CHANGED", before + " → " + p.getId());
    }

    /** Adds days to the trial (from its current end, or from now if it already ended). */
    @Transactional
    public CompanyDetail extendTrial(UUID id, int days) {
        if (days < 1 || days > 365) {
            throw ApiException.badRequest("invalid_days", "Choose 1 to 365 days");
        }
        Tenant t = tenant(id);
        Instant now = Instant.now(clock);
        Instant base = t.getStatus() == TenantStatus.TRIAL && t.getTrialEndsAt() != null && t.getTrialEndsAt().isAfter(now)
                ? t.getTrialEndsAt() : now;
        Instant end = base.plus(Duration.ofDays(days));
        t.setTrialEnd(end);
        return done(t, "TRIAL_EXTENDED", "+" + days + " days → " + LocalDate.ofInstant(end, ZONE));
    }

    /** Trial until the end of {@code day} (Saudi time). */
    @Transactional
    public CompanyDetail setTrialEnd(UUID id, LocalDate day) {
        if (day == null) {
            throw ApiException.badRequest("invalid_date", "Choose a date");
        }
        Tenant t = tenant(id);
        Instant end = day.plusDays(1).atStartOfDay(ZONE).toInstant();
        t.setTrialEnd(end);
        return done(t, "TRIAL_SET", "until " + day);
    }

    /** Ends the trial now: the company can no longer sign in until a subscription is activated. */
    @Transactional
    public CompanyDetail endTrialNow(UUID id) {
        Tenant t = tenant(id);
        if (t.getStatus() != TenantStatus.TRIAL) {
            throw ApiException.conflict("not_on_trial", "This company is not on a trial");
        }
        t.setTrialEnd(Instant.now(clock));
        return done(t, "TRIAL_ENDED", null);
    }

    /** Paid subscription on {@code planId} until the end of {@code paidUntil} (Saudi time). */
    @Transactional
    public CompanyDetail activate(UUID id, String planId, String cycle, LocalDate paidUntil) {
        if (!"MONTHLY".equals(cycle) && !"YEARLY".equals(cycle)) {
            throw ApiException.badRequest("invalid_cycle", "Choose monthly or yearly");
        }
        if (paidUntil == null || !paidUntil.isAfter(LocalDate.now(clock.withZone(ZONE)).minusDays(1))) {
            throw ApiException.badRequest("invalid_date", "The paid period must end today or later");
        }
        Tenant t = tenant(id);
        Plan p = plan(planId);
        t.activate(p.getId(), cycle, paidUntil.plusDays(1).atStartOfDay(ZONE).toInstant());
        return done(t, "ACTIVATED", p.getId() + " · " + cycle + " · until " + paidUntil);
    }

    @Transactional
    public CompanyDetail suspend(UUID id, String note) {
        Tenant t = tenant(id);
        t.suspend(blankToNull(note));
        return done(t, "SUSPENDED", blankToNull(note));
    }

    /** Lifts a suspension / cancellation back to the paid period or trial that is still running. */
    @Transactional
    public CompanyDetail reactivate(UUID id) {
        Tenant t = tenant(id);
        Instant now = Instant.now(clock);
        if (t.getPaidUntil() != null && t.getPaidUntil().isAfter(now)) {
            t.activate(t.getPlanId(), t.getBillingCycle() == null ? "MONTHLY" : t.getBillingCycle(), t.getPaidUntil());
        } else if (t.getTrialEndsAt() != null && t.getTrialEndsAt().isAfter(now)) {
            t.setTrialEnd(t.getTrialEndsAt());
        } else {
            throw ApiException.conflict("choose_period",
                    "Nothing left to resume: activate a subscription or extend the trial");
        }
        return done(t, "REACTIVATED", null);
    }

    @Transactional
    public CompanyDetail cancel(UUID id, String note) {
        Tenant t = tenant(id);
        t.cancel(blankToNull(note));
        return done(t, "CANCELLED", blankToNull(note));
    }

    // =============================================================================================
    // Overview
    // =============================================================================================

    @Transactional(readOnly = true)
    public Overview overview() {
        Timestamp now = Timestamp.from(Instant.now(clock));
        Timestamp soon = Timestamp.from(Instant.now(clock).plus(Duration.ofDays(7)));
        Timestamp monthAgo = Timestamp.from(Instant.now(clock).minus(Duration.ofDays(30)));
        Map<String, Object> c = jdbc.queryForMap("""
                select count(*) as companies,
                       count(*) filter (where status = 'TRIAL' and trial_ends_at > ?) as trials,
                       count(*) filter (where status = 'TRIAL' and trial_ends_at <= ?) as trials_expired,
                       count(*) filter (where status = 'TRIAL' and trial_ends_at > ? and trial_ends_at <= ?) as ending,
                       count(*) filter (where status = 'ACTIVE') as active,
                       count(*) filter (where status = 'PAST_DUE') as past_due,
                       count(*) filter (where status = 'SUSPENDED') as suspended,
                       count(*) filter (where status = 'CANCELLED') as cancelled,
                       count(*) filter (where created_at >= ?) as recent
                from tenants where not platform""", now, now, now, soon, monthAgo);
        Number mrr = jdbc.queryForObject("""
                select coalesce(sum(case when t.billing_cycle = 'YEARLY' and p.price_yearly_halalas is not null
                                         then p.price_yearly_halalas / 12.0 else p.price_monthly_halalas end), 0)
                from tenants t join plans p on p.id = t.plan_id
                where not t.platform and t.status in ('ACTIVE', 'PAST_DUE')""", Number.class);
        List<PlanCount> byPlan = jdbc.query("""
                select plan_id, count(*) from tenants where not platform and status in ('TRIAL', 'ACTIVE', 'PAST_DUE')
                group by plan_id order by 2 desc""", (rs, i) -> new PlanCount(rs.getString(1), rs.getLong(2)));
        List<CompanyRow> ending = jdbc.query(COMPANY_SQL
                        + " and t.status = 'TRIAL' and t.trial_ends_at > ? and t.trial_ends_at <= ? order by t.trial_ends_at limit 10",
                (rs, i) -> row(rs), now, soon);
        return new Overview(n(c.get("companies")), n(c.get("trials")), n(c.get("trials_expired")), n(c.get("ending")),
                n(c.get("active")), n(c.get("past_due")), n(c.get("suspended")), n(c.get("cancelled")),
                n(c.get("recent")), Math.round(mrr == null ? 0 : mrr.doubleValue()), byPlan, ending);
    }

    // =============================================================================================
    // Plans
    // =============================================================================================

    @Transactional(readOnly = true)
    public List<PlanRow> plans() {
        Map<String, Long> counts = new LinkedHashMap<>();
        jdbc.query("select plan_id, count(*) from tenants where not platform group by plan_id",
                rs -> {
                    counts.put(rs.getString(1), rs.getLong(2));
                });
        return plans.findAllByOrderBySortOrderAscPriceMonthlyHalalasAsc().stream()
                .map(p -> new PlanRow(p.getId(), p.getNameAr(), p.getNameEn(), p.getPriceMonthlyHalalas(),
                        p.getPriceYearlyHalalas(), p.getMaxTechnicians(), p.getFeatures(), p.isActive(),
                        p.getSortOrder(), counts.getOrDefault(p.getId(), 0L)))
                .toList();
    }

    @Transactional
    public PlanRow savePlan(String id, PlanData d, boolean create) {
        if (d.nameAr() == null || d.nameAr().isBlank() || d.nameEn() == null || d.nameEn().isBlank()) {
            throw ApiException.badRequest("invalid_name", "Enter the Arabic and English names");
        }
        if (d.priceMonthlyHalalas() < 0 || (d.priceYearlyHalalas() != null && d.priceYearlyHalalas() < 0)) {
            throw ApiException.badRequest("negative_amount", "Prices cannot be negative");
        }
        if (d.maxTechnicians() < 1 || d.maxTechnicians() > 1000) {
            throw ApiException.badRequest("invalid_max_technicians", "Technicians must be 1 to 1000");
        }
        List<String> features = d.features() == null ? List.of() : d.features().stream().distinct().toList();
        for (String f : features) {
            if (!FEATURES.contains(f)) {
                throw ApiException.badRequest("invalid_feature", "Unknown feature " + f);
            }
        }
        Plan p;
        if (create) {
            String newId = id == null ? "" : id.trim().toLowerCase();
            if (!PLAN_ID.matcher(newId).matches()) {
                throw ApiException.badRequest("invalid_plan_id", "Use 2-30 lowercase letters, digits, - or _");
            }
            if (plans.existsById(newId)) {
                throw ApiException.conflict("plan_exists", "A plan with this code already exists");
            }
            p = new Plan(newId);
        } else {
            p = plan(id);
            if (!d.active() && settings.trialPlanId().equals(p.getId())) {
                throw ApiException.conflict("trial_plan_inactive", "This plan is used for new trials: choose another trial plan first");
            }
        }
        p.update(d.nameAr().trim(), d.nameEn().trim(), d.priceMonthlyHalalas(), d.priceYearlyHalalas(),
                d.maxTechnicians(), features, d.active(), d.sortOrder());
        plans.save(p);
        audit(null, create ? "PLAN_CREATED" : "PLAN_UPDATED", p.getId());
        return plans().stream().filter(r -> r.id().equals(p.getId())).findFirst().orElseThrow();
    }

    @Transactional
    public void deletePlan(String id) {
        Plan p = plan(id);
        Long used = jdbc.queryForObject("select count(*) from tenants where plan_id = ?", Long.class, id);
        if (used != null && used > 0) {
            throw ApiException.conflict("plan_in_use", "Companies use this plan: hide it instead");
        }
        if (settings.trialPlanId().equals(id)) {
            throw ApiException.conflict("trial_plan_inactive", "This plan is used for new trials");
        }
        plans.delete(p);
        audit(null, "PLAN_DELETED", id);
    }

    // =============================================================================================
    // Settings
    // =============================================================================================

    public General general() {
        PlatformSettingsService.Settings s = settings.get();
        return new General(s.trialDays(), s.trialPlanId(), s.graceDays(), s.supportWhatsapp(), s.supportEmail());
    }

    @Transactional
    public General updateGeneral(General g) {
        if (g.trialDays() < 1 || g.trialDays() > 365) {
            throw ApiException.badRequest("invalid_days", "Trial length must be 1 to 365 days");
        }
        if (g.graceDays() < 0 || g.graceDays() > 90) {
            throw ApiException.badRequest("invalid_days", "Grace period must be 0 to 90 days");
        }
        Plan p = plan(g.trialPlanId());
        if (!p.isActive()) {
            throw ApiException.conflict("trial_plan_inactive", "Choose a plan that is offered");
        }
        String wa = blankToNull(g.supportWhatsapp());
        if (wa != null) {
            wa = PhoneNumbers.toAsciiDigits(wa).replaceAll("\\D", "");
        }
        settings.updateGeneral(g.trialDays(), p.getId(), g.graceDays(), wa, blankToNull(g.supportEmail()),
                CurrentUser.idOrNull());
        audit(null, "SETTINGS_UPDATED", "trial " + g.trialDays() + "d on " + p.getId() + ", grace " + g.graceDays() + "d");
        return general();
    }

    public MessagingView messaging() {
        PlatformSettingsService.Settings s = settings.get();
        NotificationProperties.WhatsApp wa = settings.whatsapp();
        NotificationProperties.Sms sm = settings.sms();
        List<String> keys = new ArrayList<>();
        for (NotificationTemplate t : NotificationTemplate.values()) {
            keys.add(t.name());
        }
        Map<String, String> templates = new LinkedHashMap<>();
        for (String k : keys) {
            templates.put(k, wa.templateName(k));
        }
        boolean waReady = wa.enabled() && notBlank(wa.accessToken()) && notBlank(wa.phoneNumberId());
        boolean smsReady = sm.enabled() && notBlank(sm.appSid());
        // Before the first save, show what the environment provides so the form starts from the running values.
        return new MessagingView(s.messagingConfigured(), wa.enabled(), wa.url(), wa.version(), wa.phoneNumberId(),
                s.whatsappBusinessAccountId(), mask(wa.accessToken()), mask(wa.appSecret()), mask(wa.verifyToken()),
                wa.language() == null ? "ar" : wa.language(), templates, sm.enabled(), sm.url(), mask(sm.appSid()),
                sm.senderId(), "/api/v1/webhooks/whatsapp", keys, waReady, smsReady, s.updatedAt());
    }

    @Transactional
    public MessagingView updateMessaging(MessagingData d) {
        PlatformSettingsService.Settings s = settings.get();
        // First save from the console: secrets left empty in the form keep the environment's values.
        NotificationProperties.WhatsApp wa = settings.whatsapp();
        NotificationProperties.Sms sm = settings.sms();
        boolean first = !s.messagingConfigured();
        Map<String, String> templates = new LinkedHashMap<>();
        if (d.whatsappTemplates() != null) {
            d.whatsappTemplates().forEach((k, v) -> {
                if (v != null && !v.isBlank()) {
                    templates.put(k, v.trim());
                }
            });
        }
        String url = validUrl(d.whatsappApiUrl(), "whatsapp_api_url");
        String smsUrl = validUrl(d.smsApiUrl(), "sms_api_url");
        settings.updateMessaging(d.whatsappEnabled(), url, blankToNull(d.whatsappApiVersion()),
                blankToNull(d.whatsappPhoneNumberId()), blankToNull(d.whatsappBusinessAccountId()),
                keepOrEnv(d.whatsappAccessToken(), first, wa.accessToken()),
                keepOrEnv(d.whatsappAppSecret(), first, wa.appSecret()),
                keepOrEnv(d.whatsappVerifyToken(), first, wa.verifyToken()), blankToNull(d.whatsappLanguage()),
                templates, d.smsEnabled(), smsUrl, keepOrEnv(d.smsAppSid(), first, sm.appSid()),
                blankToNull(d.smsSenderId()), CurrentUser.idOrNull());
        audit(null, "MESSAGING_UPDATED", "WhatsApp " + (d.whatsappEnabled() ? "on" : "off") + ", SMS "
                + (d.smsEnabled() ? "on" : "off"));
        return messaging();
    }

    /**
     * Sends a test: SMS with a short text, WhatsApp with Meta's built-in "hello_world" template (exists on every
     * WhatsApp Business account, so it tests the credentials without approved templates).
     */
    public TestResult test(String channel, String rawPhone) {
        String phone = PhoneNumbers.normalizeSaudiMobile(rawPhone)
                .orElseThrow(() -> ApiException.badRequest("invalid_phone", "Enter a Saudi mobile number"));
        try {
            if ("SMS".equals(channel)) {
                if (!sms.isEnabled()) {
                    return new TestResult(false, "SMS is off or the AppSid is missing");
                }
                String id = sms.send(phone, NotificationTemplate.OTP, "FieldOps: رسالة تجريبية / test message", List.of());
                return new TestResult(true, "Sent (id " + id + ")");
            }
            NotificationProperties.WhatsApp wa = settings.whatsapp();
            if (!wa.enabled() || !notBlank(wa.accessToken()) || !notBlank(wa.phoneNumberId())) {
                return new TestResult(false, "WhatsApp is off or the token / phone number ID is missing");
            }
            Map<?, ?> res = http.post()
                    .uri(wa.url() + "/{v}/{id}/messages", wa.version(), wa.phoneNumberId())
                    .header("Authorization", "Bearer " + wa.accessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("messaging_product", "whatsapp", "to", phone.replace("+", ""), "type", "template",
                            "template", Map.of("name", "hello_world", "language", Map.of("code", "en_US"))))
                    .retrieve()
                    .body(Map.class);
            return new TestResult(true, "Sent: " + (res == null ? "" : String.valueOf(res.get("messages"))));
        } catch (MessageChannel.ChannelException e) {
            return new TestResult(false, e.getMessage());
        } catch (RestClientResponseException e) {
            return new TestResult(false, e.getStatusCode().value() + ": " + e.getResponseBodyAsString());
        } catch (RuntimeException e) {
            return new TestResult(false, e.getMessage());
        }
    }

    // =============================================================================================
    // Helpers
    // =============================================================================================

    private Tenant tenant(UUID id) {
        return tenants.findById(id).filter(t -> !t.isPlatform()).orElseThrow(() -> ApiException.notFound("tenant"));
    }

    private Plan plan(String id) {
        return plans.findById(id == null ? "" : id).orElseThrow(() -> ApiException.notFound("plan"));
    }

    private CompanyDetail done(Tenant t, String action, String details) {
        tenants.saveAndFlush(t);
        access.evict(t.getId());
        planFeatures.evict(t.getId());
        audit(t.getId(), action, details);
        return company(t.getId());
    }

    void audit(UUID tenantId, String action, String details) {
        jdbc.update("""
                insert into platform_audit (id, tenant_id, action, details, actor_id, actor_name)
                values (?, ?, ?, ?, ?, ?)""", UUID.randomUUID(), tenantId, action, details, CurrentUser.idOrNull(),
                CurrentUser.nameOrNull());
    }

    private CompanyRow row(java.sql.ResultSet rs) throws java.sql.SQLException {
        TenantStatus status = TenantStatus.valueOf(rs.getString("status"));
        Instant trialEnds = instant(rs.getTimestamp("trial_ends_at"));
        Instant now = Instant.now(clock);
        boolean usable = switch (status) {
            case ACTIVE, PAST_DUE -> true;
            case TRIAL -> trialEnds != null && now.isBefore(trialEnds);
            case SUSPENDED, CANCELLED -> false;
        };
        return new CompanyRow((UUID) rs.getObject("id"), rs.getString("name"), rs.getString("slug"),
                rs.getString("plan_id"), status.name(), usable, trialEnds, instant(rs.getTimestamp("paid_until")),
                rs.getString("billing_cycle"), rs.getString("status_note"), instant(rs.getTimestamp("created_at")),
                rs.getString("owner_name"), rs.getString("owner_phone"), rs.getString("owner_email"),
                rs.getInt("user_count"), instant(rs.getTimestamp("last_login")));
    }

    private static Instant instant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }

    private static long n(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }

    private static Secret mask(String s) {
        if (s == null || s.isEmpty()) {
            return new Secret(false, null);
        }
        return new Secret(true, s.length() <= 4 ? "••••" : "••••" + s.substring(s.length() - 4));
    }

    private static String keepOrEnv(String incoming, boolean first, String envValue) {
        if (incoming == null && first) {
            return envValue;
        }
        return incoming;
    }

    private static String validUrl(String url, String field) {
        String u = blankToNull(url);
        if (u != null && !u.matches("https://[^\\s]+")) {
            throw ApiException.badRequest("invalid_url", "The " + field + " must start with https://");
        }
        return u;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

}
