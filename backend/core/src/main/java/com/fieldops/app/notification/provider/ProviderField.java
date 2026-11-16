package com.fieldops.app.notification.provider;

/**
 * One setting a provider needs, as shown in Platform → Settings → Messaging.
 *
 * @param key         key in the stored settings / secrets JSON
 * @param label       provider's own term (shown as-is, not translated)
 * @param secret      stored encrypted and never returned except masked
 * @param required    the provider cannot send without it
 * @param placeholder example or default value
 */
public record ProviderField(String key, String label, boolean secret, boolean required, String placeholder) {

    public static final String API_URL = "apiUrl";

    public static ProviderField text(String key, String label, boolean required, String placeholder) {
        return new ProviderField(key, label, false, required, placeholder);
    }

    public static ProviderField secret(String key, String label, boolean required) {
        return new ProviderField(key, label, true, required, null);
    }

    public static ProviderField apiUrl(String defaultUrl) {
        return new ProviderField(API_URL, "API URL", false, false, defaultUrl);
    }
}
