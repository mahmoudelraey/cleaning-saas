package com.fieldops.app.notification.channel;

import java.util.List;
import java.util.Map;

import com.fieldops.app.notification.NotificationTemplate;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * SMS through Unifonic (a common Saudi provider). Verify the endpoint and field names against your
 * Unifonic account's API docs; swap this class for Taqnyat/Msegat by implementing {@link MessageChannel}.
 * Note: the sender id must be registered with the provider (CITC rules for Saudi numbers).
 */
@Component
public class UnifonicSmsChannel implements MessageChannel {

    private final NotificationProperties.Sms config;
    private final RestClient http;

    public UnifonicSmsChannel(NotificationProperties props, RestClient.Builder builder) {
        this.config = props.sms();
        this.http = builder.baseUrl(config.url()).build();
    }

    @Override
    public ChannelType type() {
        return ChannelType.SMS;
    }

    @Override
    public boolean isEnabled() {
        return config.enabled() && config.appSid() != null && !config.appSid().isBlank();
    }

    @Override
    @SuppressWarnings("unchecked")
    public String send(String toE164, NotificationTemplate template, String body, List<String> params) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("AppSid", config.appSid());
        form.add("SenderID", config.senderId());
        form.add("Recipient", toE164.replace("+", ""));
        form.add("Body", body);
        form.add("responseType", "JSON");
        try {
            Map<String, Object> response = http.post()
                    .uri("/rest/SMS/messages")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
            if (response == null || !Boolean.TRUE.equals(response.get("success"))) {
                throw new ChannelException("SMS rejected: " + response, true, null);
            }
            Object data = response.get("data");
            Object id = data instanceof Map<?, ?> m ? m.get("MessageID") : null;
            return id == null ? "sms-unknown" : String.valueOf(id);
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            throw new ChannelException("SMS " + status + ": " + e.getResponseBodyAsString(),
                    status >= 400 && status < 500 && status != 429, e);
        } catch (ResourceAccessException e) {
            throw new ChannelException("SMS provider unreachable: " + e.getMessage(), false, e);
        }
    }
}
