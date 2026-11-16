package com.fieldops.app.notification.provider;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldops.app.notification.NotificationTemplate;
import com.fieldops.app.notification.channel.NotificationProperties;
import com.fieldops.app.platform.SettingsCipher;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Settings of every message provider, edited by the platform admin (Platform → Settings → Messaging) and stored in
 * {@code messaging_providers} (V35): on/off, priority, non-secret settings, encrypted secrets, template mapping.
 *
 * <p>Read with plain JDBC (no tenant, no RLS) and cached for a few seconds, so the dispatcher and the webhook in
 * either app process pick up changes without a restart. Until Meta / Unifonic are saved once in the console their
 * {@code app.notifications.*} environment settings apply, as before.
 */
@Service
public class MessagingProviderService {

    private static final Duration TTL = Duration.ofSeconds(20);
    private static final TypeReference<Map<String, String>> MAP = new TypeReference<>() { };

    private final JdbcTemplate jdbc;
    private final SettingsCipher cipher;
    private final NotificationProperties env;
    private final ObjectMapper json;
    private final Clock clock;

    private volatile Snapshot cached;

    private record Snapshot(Map<ProviderType, ProviderConfig> configs, Instant validUntil) {
    }

    public MessagingProviderService(JdbcTemplate jdbc, SettingsCipher cipher, NotificationProperties env,
                                    ObjectMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.env = env;
        this.json = json;
        this.clock = clock;
    }

    public ProviderConfig config(ProviderType type) {
        return all().get(type);
    }

    /** Every provider's settings in effect (a provider never saved gets defaults, or the environment's). */
    public Map<ProviderType, ProviderConfig> all() {
        Snapshot s = cached;
        Instant now = Instant.now(clock);
        if (s == null || !now.isBefore(s.validUntil())) {
            Map<ProviderType, ProviderConfig> stored;
            try {
                stored = load();
            } catch (DataAccessException e) {
                // Table not there yet (the other app started before the admin migration): defaults / environment.
                stored = Map.of();
            }
            Map<ProviderType, ProviderConfig> effective = new EnumMap<>(ProviderType.class);
            for (ProviderType t : ProviderType.values()) {
                ProviderConfig c = stored.get(t);
                effective.put(t, withEnvironment(c == null ? unsaved(t) : c));
            }
            s = new Snapshot(effective, now.plus(TTL));
            cached = s;
        }
        return s.configs();
    }

    public void evict() {
        cached = null;
    }

    /**
     * Saves one provider (insert or replace). Values are already merged by the caller: {@code secrets} holds the
     * plain secrets to keep (each encrypted here), {@code settings} the non-secret fields.
     */
    public void save(ProviderType type, boolean enabled, int priority, Map<String, String> settings,
                     Map<String, String> secrets, Map<String, String> templates, UUID actor) {
        Map<String, String> encrypted = new LinkedHashMap<>();
        secrets.forEach((k, v) -> {
            String e = cipher.encrypt(v);
            if (e != null) {
                encrypted.put(k, e);
            }
        });
        jdbc.update("""
                insert into messaging_providers (provider, enabled, priority, saved, settings, secrets, templates,
                                                 updated_at, updated_by)
                values (?, ?, ?, true, cast(? as jsonb), cast(? as jsonb), cast(? as jsonb), now(), ?)
                on conflict (provider) do update set enabled = excluded.enabled, priority = excluded.priority,
                       saved = true, settings = excluded.settings, secrets = excluded.secrets,
                       templates = excluded.templates, updated_at = now(), updated_by = excluded.updated_by""",
                type.name(), enabled, priority, write(settings), write(encrypted), write(templates), actor);
        evict();
    }

    // ---------------------------------------------------------------------------------------------

    private Map<ProviderType, ProviderConfig> load() {
        Map<ProviderType, ProviderConfig> result = new EnumMap<>(ProviderType.class);
        jdbc.query("select * from messaging_providers", (ResultSet rs) -> {
            ProviderType type;
            try {
                type = ProviderType.valueOf(rs.getString("provider"));
            } catch (IllegalArgumentException e) {
                return; // a provider removed from the code
            }
            result.put(type, row(type, rs));
        });
        return result;
    }

    private ProviderConfig row(ProviderType type, ResultSet rs) throws SQLException {
        Map<String, String> values = new HashMap<>(read(rs.getString("settings")));
        read(rs.getString("secrets")).forEach((k, v) -> {
            String plain = cipher.decrypt(v);
            if (plain != null) {
                values.put(k, plain);
            }
        });
        Timestamp updated = rs.getTimestamp("updated_at");
        return new ProviderConfig(type, rs.getBoolean("enabled"), rs.getInt("priority"), rs.getBoolean("saved"),
                values, read(rs.getString("templates")), updated == null ? null : updated.toInstant());
    }

    private static ProviderConfig unsaved(ProviderType type) {
        return new ProviderConfig(type, type == ProviderType.LOG, type.defaultPriority(), false, Map.of(), Map.of(),
                null);
    }

    /** Meta and Unifonic keep working from the environment variables until they are saved in the console. */
    private ProviderConfig withEnvironment(ProviderConfig c) {
        if (c.type() == ProviderType.META_WHATSAPP) {
            Map<String, String> templates = c.templates();
            if (templates.isEmpty()) {
                // Saved without template names (or never saved): the YAML defaults.
                templates = new LinkedHashMap<>();
                for (NotificationTemplate t : NotificationTemplate.values()) {
                    templates.put(t.name(), env.whatsapp().templateName(t.name()));
                }
            }
            if (c.saved()) {
                return new ProviderConfig(c.type(), c.enabled(), c.priority(), true, c.values(), templates,
                        c.updatedAt());
            }
            NotificationProperties.WhatsApp wa = env.whatsapp();
            Map<String, String> v = new HashMap<>();
            put(v, MetaWhatsAppProvider.PHONE_NUMBER_ID, wa.phoneNumberId());
            put(v, MetaWhatsAppProvider.ACCESS_TOKEN, wa.accessToken());
            put(v, MetaWhatsAppProvider.APP_SECRET, wa.appSecret());
            put(v, MetaWhatsAppProvider.VERIFY_TOKEN, wa.verifyToken());
            put(v, MetaWhatsAppProvider.LANGUAGE, wa.language());
            put(v, MetaWhatsAppProvider.API_VERSION, wa.apiVersion());
            put(v, ProviderField.API_URL, wa.apiUrl());
            return new ProviderConfig(c.type(), wa.enabled(), c.priority(), false, v, templates, null);
        }
        if (c.type() == ProviderType.UNIFONIC_SMS && !c.saved()) {
            NotificationProperties.Sms sms = env.sms();
            Map<String, String> v = new HashMap<>();
            put(v, UnifonicSmsProvider.APP_SID, sms.appSid());
            put(v, UnifonicSmsProvider.SENDER_ID, sms.senderId());
            put(v, ProviderField.API_URL, sms.baseUrl());
            return new ProviderConfig(c.type(), sms.enabled(), c.priority(), false, v, Map.of(), null);
        }
        return c;
    }

    private static void put(Map<String, String> m, String k, String v) {
        if (v != null && !v.isBlank()) {
            m.put(k, v);
        }
    }

    private Map<String, String> read(String text) {
        if (text == null || text.isBlank()) {
            return Map.of();
        }
        try {
            Map<String, String> m = json.readValue(text, MAP);
            return m == null ? Map.of() : m;
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String write(Map<String, String> m) {
        try {
            return json.writeValueAsString(m == null ? Map.of() : m);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid provider settings", e);
        }
    }
}
