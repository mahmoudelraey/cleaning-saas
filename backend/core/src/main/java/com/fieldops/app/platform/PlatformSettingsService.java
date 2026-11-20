package com.fieldops.app.platform;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Platform-wide settings edited by the FieldOps owner (Platform → Settings): trial length and plan, grace period,
 * support contact, and Google reviews (shown or hidden for every company, with the Places API key). Message
 * providers have their own table and service ({@code MessagingProviderService}).
 *
 * <p>Read with plain JDBC (the table has no tenant and no RLS) and cached for a few seconds, so changes apply
 * without a restart, including in the other app process.
 */
@Service
public class PlatformSettingsService {

    /** Fixed id of the tenant that holds the platform owner's account (see V25). */
    public static final UUID PLATFORM_TENANT_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private static final Duration TTL = Duration.ofSeconds(20);

    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final SettingsCipher cipher;
    /** GOOGLE_PLACES_API_KEY: used when Google reviews are switched on but no key was saved in the console. */
    private final String envPlacesKey;

    private volatile Snapshot cached;

    public PlatformSettingsService(JdbcTemplate jdbc, Clock clock, SettingsCipher cipher,
                                   @Value("${app.google.places-api-key:}") String envPlacesKey) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.cipher = cipher;
        this.envPlacesKey = envPlacesKey == null ? "" : envPlacesKey.trim();
    }

    /**
     * @param googlePlacesEnabled show Google reviews (connect a listing in Settings, rating on the public page)
     * @param googlePlacesKey     the saved Places API key, decrypted; null when none was saved
     */
    public record Settings(int trialDays, String trialPlanId, int graceDays, String supportWhatsapp,
                           String supportEmail, Instant updatedAt, boolean googlePlacesEnabled,
                           String googlePlacesKey) {
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

    /** The Places API key to call Google with, or "" when Google reviews are switched off or no key is set. */
    public String googlePlacesKey() {
        Settings s = get();
        if (!s.googlePlacesEnabled()) {
            return "";
        }
        return s.googlePlacesKey() != null && !s.googlePlacesKey().isBlank() ? s.googlePlacesKey() : envPlacesKey;
    }

    /** True when GOOGLE_PLACES_API_KEY is set on the server (used when no key is saved in the console). */
    public boolean googlePlacesEnvKeySet() {
        return !envPlacesKey.isEmpty();
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
     * Google reviews switch and key.
     *
     * @param apiKey null = keep the saved key, "" = remove it, text = replace it
     */
    public void updateGooglePlaces(boolean enabled, String apiKey, UUID actor) {
        if (apiKey == null) {
            jdbc.update("""
                    update platform_settings set google_places_enabled = ?, updated_at = now(), updated_by = ?
                    where id = 1""", enabled, actor);
        } else {
            jdbc.update("""
                    update platform_settings set google_places_enabled = ?, google_places_api_key = ?,
                           updated_at = now(), updated_by = ?
                    where id = 1""", enabled, cipher.encrypt(apiKey.trim()), actor);
        }
        evict();
    }

    // ---------------------------------------------------------------------------------------------

    private Settings load() {
        return jdbc.query("select * from platform_settings where id = 1", rs -> {
            if (!rs.next()) {
                return defaults();
            }
            java.sql.Timestamp updated = rs.getTimestamp("updated_at");
            return new Settings(rs.getInt("trial_days"), rs.getString("trial_plan_id"), rs.getInt("grace_days"),
                    rs.getString("support_whatsapp"), rs.getString("support_email"),
                    updated == null ? null : updated.toInstant(), rs.getBoolean("google_places_enabled"),
                    decryptOrNull(rs.getString("google_places_api_key")));
        });
    }

    private String decryptOrNull(String stored) {
        if (stored == null || stored.isEmpty()) {
            return null;
        }
        try {
            return cipher.decrypt(stored);
        } catch (RuntimeException e) {
            return null; // encryption key changed: enter the key again in Platform → Settings
        }
    }

    private static Settings defaults() {
        return new Settings(14, "pro", 7, null, null, null, false, null);
    }
}
