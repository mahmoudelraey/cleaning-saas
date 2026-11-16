package com.fieldops.app.notification.provider;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fieldops.app.notification.channel.ChannelType;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * WhatsApp Business Cloud API (Meta). Business-initiated messages must use approved templates, so each message
 * sends the template mapped to its {@code NotificationTemplate} with the parameters in order.
 * Delivery receipts arrive at {@code /api/v1/webhooks/whatsapp} (needs the app secret and verify token).
 * Docs: developers.facebook.com/docs/whatsapp/cloud-api
 */
@Component
public class MetaWhatsAppProvider implements NotificationProvider {

    static final String PHONE_NUMBER_ID = "phoneNumberId";
    static final String ACCESS_TOKEN = "accessToken";
    public static final String APP_SECRET = "appSecret";
    public static final String VERIFY_TOKEN = "verifyToken";
    static final String API_VERSION = "apiVersion";
    static final String LANGUAGE = "language";
    static final String BUSINESS_ACCOUNT_ID = "businessAccountId";

    private static final List<ProviderField> FIELDS = List.of(
            ProviderField.text(PHONE_NUMBER_ID, "Phone number ID", true, null),
            ProviderField.secret(ACCESS_TOKEN, "Access token", true),
            ProviderField.secret(APP_SECRET, "App secret (webhook signature)", false),
            ProviderField.secret(VERIFY_TOKEN, "Webhook verify token", false),
            ProviderField.text(LANGUAGE, "Template language", false, "ar"),
            ProviderField.text(BUSINESS_ACCOUNT_ID, "WhatsApp Business Account ID", false, null),
            ProviderField.text(API_VERSION, "Graph API version", false, "v21.0"),
            ProviderField.apiUrl("https://graph.facebook.com"));

    private final RestClient http;

    public MetaWhatsAppProvider(RestClient.Builder builder) {
        this.http = builder.build();
    }

    @Override
    public ProviderType type() {
        return ProviderType.META_WHATSAPP;
    }

    @Override
    public List<ProviderField> fields() {
        return FIELDS;
    }

    @Override
    public String send(ChannelType channel, ProviderConfig config, OutgoingMessage message) {
        String name = config.template(message.template());
        if (name == null) {
            name = message.template().name().toLowerCase();
        }
        List<Map<String, Object>> parameters = new ArrayList<>();
        for (String p : message.params()) {
            parameters.add(Map.of("type", "text", "text", p == null || p.isBlank() ? "-" : p));
        }
        Map<String, Object> template = Map.of(
                "name", name,
                "language", Map.of("code", config.get(LANGUAGE, "ar")),
                "components", List.of(Map.of("type", "body", "parameters", parameters)));
        return post(config, message.digits(), template);
    }

    /** Meta's built-in "hello_world" template exists on every account, so the test needs no approved template. */
    @Override
    public String sendTest(ChannelType channel, ProviderConfig config, String toE164) {
        return post(config, toE164.replace("+", ""),
                Map.of("name", "hello_world", "language", Map.of("code", "en_US")));
    }

    @SuppressWarnings("unchecked")
    private String post(ProviderConfig config, String to, Map<String, Object> template) {
        Map<String, Object> payload = Map.of(
                "messaging_product", "whatsapp",
                "to", to,
                "type", "template",
                "template", template);
        try {
            Map<String, Object> response = http.post()
                    .uri(config.url("https://graph.facebook.com") + "/{version}/{phoneId}/messages",
                            config.get(API_VERSION, "v21.0"), config.get(PHONE_NUMBER_ID))
                    .header("Authorization", "Bearer " + config.get(ACCESS_TOKEN))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(Map.class);
            List<Map<String, Object>> messages = response == null ? null : (List<Map<String, Object>>) response.get("messages");
            if (messages == null || messages.isEmpty()) {
                throw new ProviderException("Meta WhatsApp returned no message id", false, null);
            }
            return String.valueOf(messages.get(0).get("id"));
        } catch (RestClientResponseException e) {
            throw ProviderException.of("Meta WhatsApp", e);
        } catch (ResourceAccessException e) {
            throw ProviderException.unreachable("Meta WhatsApp", e);
        }
    }
}
