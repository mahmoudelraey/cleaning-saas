package com.fieldops.app.notification.channel;

import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * <pre>
 * app.notifications.whatsapp.enabled / access-token / phone-number-id / app-secret / verify-token / language
 * app.notifications.whatsapp.templates.BOOKING_CONFIRMED=booking_confirmed   (Meta-approved template names)
 * app.notifications.sms.enabled / app-sid / sender-id / base-url
 * </pre>
 */
@ConfigurationProperties(prefix = "app.notifications")
public record NotificationProperties(WhatsApp whatsapp, Sms sms) {

    public NotificationProperties {
        whatsapp = whatsapp == null ? new WhatsApp(false, null, null, null, null, "ar", null, null, null) : whatsapp;
        sms = sms == null ? new Sms(false, null, null, null) : sms;
    }

    public record WhatsApp(boolean enabled, String accessToken, String phoneNumberId, String appSecret,
                           String verifyToken, String language, String apiVersion, Map<String, String> templates,
                           String apiUrl) {

        public String templateName(String template) {
            if (templates != null) {
                // Keys may arrive upper- or lower-case depending on YAML vs environment variables.
                for (Map.Entry<String, String> e : templates.entrySet()) {
                    if (e.getKey().equalsIgnoreCase(template) || e.getKey().equalsIgnoreCase(template.replace('_', '-'))) {
                        return e.getValue();
                    }
                }
            }
            return template.toLowerCase();
        }

        public String version() {
            return apiVersion == null || apiVersion.isBlank() ? "v21.0" : apiVersion;
        }

        /** Graph API base URL (no trailing slash). */
        public String url() {
            String u = apiUrl == null || apiUrl.isBlank() ? "https://graph.facebook.com" : apiUrl.trim();
            return u.endsWith("/") ? u.substring(0, u.length() - 1) : u;
        }
    }

    public record Sms(boolean enabled, String appSid, String senderId, String baseUrl) {

        public String url() {
            String u = baseUrl == null || baseUrl.isBlank() ? "https://el.cloud.unifonic.com" : baseUrl.trim();
            return u.endsWith("/") ? u.substring(0, u.length() - 1) : u;
        }
    }
}
