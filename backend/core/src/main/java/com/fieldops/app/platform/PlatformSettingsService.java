package com.fieldops.app.platform;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldops.app.notification.channel.NotificationProperties;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Platform-wide settings edited by the FieldOps owner (Platform → Settings): trial length and plan, grace period,
 * support contact, and the one WhatsApp Cloud API / Unifonic SMS account every company's messages go through.
 *
 * <p>Read with plain JDBC (the table has no tenant and no RLS) and cached for a few seconds, so the message
 * dispatcher and webhook pick up changes without a restart, including in the other app process. Until messaging
 * is saved here once ({@code messaging_configured}), the {@code app.notifications.*} environment settings apply.
 */
@Service
public class PlatformSettingsService {

    /** Fixed id of the tenant that holds the platform owner's account (see V25). */
    public static final UUID PLATFORM_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private static final Duration TTL = Duration.ofSeconds(20);

    private final JdbcTemplate jdbc;
    private final SettingsCipher cipher;
    private final NotificationProperties env;
    private final ObjectMapper json;
    private final Clock clock;

    private volatile Snapshot cached;

    public PlatformSettingsService(JdbcTemplate jdbc, SettingsCipher cipher, NotificationProperties env,
                                   ObjectMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.env = env;
        this.json = json;
        this.clock = clock;
    }

    /** Decrypted settings. Secrets must never leave the server except masked. */
    public record Settings(int trialDays, String trialPlanId, int graceDays, String supportWhatsapp,
                           String supportEmail, boolean messagingConfigured, boolean whatsappEnabled,
                           String whatsappApiUrl, String whatsappApiVersion, String whatsappPhoneNumberId,
                           String whatsappBusinessAccountId, String whatsappAccessToken, String whatsappAppSecret,
                           String whatsappVerifyToken, String whatsappLanguage, Map<String, String> whatsappTemplates,
                           boolean smsEnabled, String smsApiUrl, String smsAppSid, String smsSenderId,
                           Instant updatedAt) {
    }

    private record Snapshot(Settings settings, Instant validUntil) {
    }

    public Settings get() {
        Snapshot s = cached;
        Instant now = Instant.now(clock);
        if (s == null || !now.isBefore(s.validUntil())) {
            Settings loaded;
            try {
                loaded = load();
            } catch (DataAccessException e) {
                // Table not there yet (the other app started before the admin migration): environment settings.
                loaded = defaults();
            }
            s = new Snapshot(loaded, now.plus(TTL));
            cached = s;
        }
        return s.settings();
    }

    public void evict() {
        cached = null;
    }

    // ---- effective values used by the rest of the app ---------------------------------------------------

    public int trialDays() {
        return get().trialDays();
    }

    public String trialPlanId() {
        return get().trialPlanId();
    }

    public int graceDays() {
        return get().graceDays();
    }

    /** WhatsApp settings in effect: the console's once saved there, otherwise the environment's. */
    public NotificationProperties.WhatsApp whatsapp() {
        Settings s = get();
        if (!s.messagingConfigured()) {
            return env.whatsapp();
        }
        return new NotificationProperties.WhatsApp(s.whatsappEnabled(), s.whatsappAccessToken(),
                s.whatsappPhoneNumberId(), s.whatsappAppSecret(), s.whatsappVerifyToken(),
                blank(s.whatsappLanguage()) ? "ar" : s.whatsappLanguage(), s.whatsappApiVersion(),
                s.whatsappTemplates().isEmpty() ? env.whatsapp().templates() : s.whatsappTemplates(),
                s.whatsappApiUrl());
    }

    /** SMS settings in effect: the console's once saved there, otherwise the environment's. */
    public NotificationProperties.Sms sms() {
        Settings s = get();
        if (!s.messagingConfigured()) {
            return env.sms();
        }
        return new NotificationProperties.Sms(s.smsEnabled(), s.smsAppSid(), s.smsSenderId(), s.smsApiUrl());
    }

    // ---- writes (platform console only) -------------------------------------------------------------

    public void updateGeneral(int trialDays, String trialPlanId, int graceDays, String supportWhatsapp,
                              String supportEmail, UUID actor) {
        jdbc.update("""
                update platform_settings set trial_days = ?, trial_plan_id = ?, grace_days = ?, support_whatsapp = ?,
                       support_email = ?, updated_at = now(), updated_by = ?
                where id = 1""", trialDays, trialPlanId, graceDays, supportWhatsapp, supportEmail, actor);
        evict();
    }

    /**
     * Saves the messaging section. A secret passed as null keeps the stored one; an empty string clears it.
     */
    public void updateMessaging(boolean whatsappEnabled, String whatsappApiUrl, String whatsappApiVersion,
                                String phoneNumberId, String businessAccountId, String accessToken, String appSecret,
                                String verifyToken, String language, Map<String, String> templates,
                                boolean smsEnabled, String smsApiUrl, String smsAppSid, String smsSenderId,
                                UUID actor) {
        Settings cur = load();
        String templatesJson;
        try {
            templatesJson = json.writeValueAsString(templates == null ? Map.of() : templates);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid templates", e);
        }
        jdbc.update("""
                update platform_settings set messaging_configured = true,
                       whatsapp_enabled = ?, whatsapp_api_url = ?, whatsapp_api_version = ?, whatsapp_phone_number_id = ?,
                       whatsapp_business_account_id = ?, whatsapp_access_token = ?, whatsapp_app_secret = ?,
                       whatsapp_verify_token = ?, whatsapp_language = ?, whatsapp_templates = cast(? as jsonb),
                       sms_enabled = ?, sms_api_url = ?, sms_app_sid = ?, sms_sender_id = ?,
                       updated_at = now(), updated_by = ?
                where id = 1""",
                whatsappEnabled, whatsappApiUrl, whatsappApiVersion, phoneNumberId, businessAccountId,
                secret(accessToken, cur.whatsappAccessToken()), secret(appSecret, cur.whatsappAppSecret()),
                secret(verifyToken, cur.whatsappVerifyToken()), language, templatesJson,
                smsEnabled, smsApiUrl, secret(smsAppSid, cur.smsAppSid()), smsSenderId, actor);
        evict();
    }

    /** New value encrypted; null keeps the current (re-encrypted), "" clears. */
    private String secret(String incoming, String current) {
        if (incoming == null) {
            return cipher.encrypt(current);
        }
        return incoming.isEmpty() ? null : cipher.encrypt(incoming.trim());
    }

    // ---------------------------------------------------------------------------------------------

    private Settings load() {
        return jdbc.query("select * from platform_settings where id = 1", rs -> {
            if (!rs.next()) {
                return defaults();
            }
            Map<String, String> templates = new LinkedHashMap<>();
            String t = rs.getString("whatsapp_templates");
            if (t != null && !t.isBlank()) {
                try {
                    templates.putAll(json.readValue(t, new TypeReference<Map<String, String>>() { }));
                } catch (Exception ignored) {
                    // Keep defaults if the stored JSON is malformed.
                }
            }
            java.sql.Timestamp updated = rs.getTimestamp("updated_at");
            return new Settings(rs.getInt("trial_days"), rs.getString("trial_plan_id"), rs.getInt("grace_days"),
                    rs.getString("support_whatsapp"), rs.getString("support_email"),
                    rs.getBoolean("messaging_configured"), rs.getBoolean("whatsapp_enabled"),
                    rs.getString("whatsapp_api_url"), rs.getString("whatsapp_api_version"),
                    rs.getString("whatsapp_phone_number_id"), rs.getString("whatsapp_business_account_id"),
                    cipher.decrypt(rs.getString("whatsapp_access_token")),
                    cipher.decrypt(rs.getString("whatsapp_app_secret")),
                    cipher.decrypt(rs.getString("whatsapp_verify_token")), rs.getString("whatsapp_language"),
                    templates, rs.getBoolean("sms_enabled"), rs.getString("sms_api_url"),
                    cipher.decrypt(rs.getString("sms_app_sid")), rs.getString("sms_sender_id"),
                    updated == null ? null : updated.toInstant());
        });
    }

    private static Settings defaults() {
        return new Settings(14, "pro", 7, null, null, false, false, null, null, null, null, null, null, null, null,
                Map.of(), false, null, null, null, null);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
