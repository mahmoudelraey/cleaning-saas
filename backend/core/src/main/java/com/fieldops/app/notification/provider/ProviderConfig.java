package com.fieldops.app.notification.provider;

import java.time.Instant;
import java.util.Map;

import com.fieldops.app.notification.NotificationTemplate;

/**
 * A provider's settings in effect (secrets decrypted).
 *
 * @param saved     false until the platform admin saves this provider once; Meta and Unifonic then still use the
 *                  {@code app.notifications.*} environment settings
 * @param values    fields and secrets by {@link ProviderField#key()}
 * @param templates provider template name / id per {@link NotificationTemplate} name (WhatsApp providers)
 */
public record ProviderConfig(ProviderType type, boolean enabled, int priority, boolean saved,
                             Map<String, String> values, Map<String, String> templates, Instant updatedAt) {

    public ProviderConfig {
        values = clean(values);
        templates = clean(templates);
    }

    private static Map<String, String> clean(Map<String, String> m) {
        Map<String, String> out = new java.util.HashMap<>();
        if (m != null) {
            m.forEach((k, v) -> {
                if (k != null && v != null) {
                    out.put(k, v);
                }
            });
        }
        return Map.copyOf(out);
    }

    public String get(String key) {
        String v = values.get(key);
        return v == null || v.isBlank() ? null : v.trim();
    }

    public String get(String key, String fallback) {
        String v = get(key);
        return v == null ? fallback : v;
    }

    public boolean has(String key) {
        return get(key) != null;
    }

    /** Base URL without a trailing slash. */
    public String url(String fallback) {
        String u = get(ProviderField.API_URL, fallback);
        return u.endsWith("/") ? u.substring(0, u.length() - 1) : u;
    }

    /** The provider's template for this message, or null when none is mapped. */
    public String template(NotificationTemplate template) {
        String v = templates.get(template.name());
        return v == null || v.isBlank() ? null : v.trim();
    }
}
