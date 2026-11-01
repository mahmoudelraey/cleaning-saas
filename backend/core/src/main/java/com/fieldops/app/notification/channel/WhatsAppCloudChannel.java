package com.fieldops.app.notification.channel;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fieldops.app.notification.NotificationTemplate;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * WhatsApp Business Cloud API (Meta). Business-initiated messages must use approved templates, so this
 * channel sends the template mapped to each {@link NotificationTemplate} with its parameters.
 * Docs: developers.facebook.com/docs/whatsapp/cloud-api
 */
@Component
public class WhatsAppCloudChannel implements MessageChannel {

    private final NotificationProperties.WhatsApp config;
    private final RestClient http;

    public WhatsAppCloudChannel(NotificationProperties props, RestClient.Builder builder) {
        this.config = props.whatsapp();
        this.http = builder.baseUrl("https://graph.facebook.com").build();
    }

    @Override
    public ChannelType type() {
        return ChannelType.WHATSAPP;
    }

    @Override
    public boolean isEnabled() {
        return config.enabled() && notBlank(config.accessToken()) && notBlank(config.phoneNumberId());
    }

    @Override
    @SuppressWarnings("unchecked")
    public String send(String toE164, NotificationTemplate template, String body, List<String> params) {
        List<Map<String, Object>> parameters = new ArrayList<>();
        for (String p : params) {
            parameters.add(Map.of("type", "text", "text", p == null || p.isBlank() ? "-" : p));
        }
        Map<String, Object> payload = Map.of(
                "messaging_product", "whatsapp",
                "to", toE164.replace("+", ""),
                "type", "template",
                "template", Map.of(
                        "name", config.templateName(template.name()),
                        "language", Map.of("code", config.language() == null ? "ar" : config.language()),
                        "components", List.of(Map.of("type", "body", "parameters", parameters))));
        try {
            Map<String, Object> response = http.post()
                    .uri("/{version}/{phoneId}/messages", config.version(), config.phoneNumberId())
                    .header("Authorization", "Bearer " + config.accessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(Map.class);
            List<Map<String, Object>> messages = response == null ? null : (List<Map<String, Object>>) response.get("messages");
            if (messages == null || messages.isEmpty()) {
                throw new ChannelException("WhatsApp returned no message id", false, null);
            }
            return String.valueOf(messages.get(0).get("id"));
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            // 4xx (bad number, template not approved, user not on WhatsApp) will not fix itself → fall back to SMS.
            boolean permanent = status >= 400 && status < 500 && status != 429;
            throw new ChannelException("WhatsApp " + status + ": " + e.getResponseBodyAsString(), permanent, e);
        } catch (ResourceAccessException e) {
            throw new ChannelException("WhatsApp unreachable: " + e.getMessage(), false, e);
        }
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
