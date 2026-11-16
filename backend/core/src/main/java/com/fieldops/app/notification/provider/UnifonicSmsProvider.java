package com.fieldops.app.notification.provider;

import java.util.List;
import java.util.Map;

import com.fieldops.app.notification.channel.ChannelType;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * SMS through Unifonic (the original FieldOps SMS provider; still read from the {@code UNIFONIC_*} environment
 * variables until saved in the console). The sender id must be registered with the provider (CST rules).
 */
@Component
public class UnifonicSmsProvider implements NotificationProvider {

    static final String APP_SID = "appSid";
    static final String SENDER_ID = "senderId";

    private static final List<ProviderField> FIELDS = List.of(
            ProviderField.secret(APP_SID, "AppSid", true),
            ProviderField.text(SENDER_ID, "Sender ID", false, null),
            ProviderField.apiUrl("https://el.cloud.unifonic.com"));

    private final RestClient http;

    public UnifonicSmsProvider(RestClient.Builder builder) {
        this.http = builder.build();
    }

    @Override
    public ProviderType type() {
        return ProviderType.UNIFONIC_SMS;
    }

    @Override
    public List<ProviderField> fields() {
        return FIELDS;
    }

    @Override
    @SuppressWarnings("unchecked")
    public String send(ChannelType channel, ProviderConfig config, OutgoingMessage message) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("AppSid", config.get(APP_SID));
        form.add("SenderID", config.get(SENDER_ID));
        form.add("Recipient", message.digits());
        form.add("Body", message.body());
        form.add("responseType", "JSON");
        try {
            Map<String, Object> response = http.post()
                    .uri(config.url("https://el.cloud.unifonic.com") + "/rest/SMS/messages")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
            if (response == null || !Boolean.TRUE.equals(response.get("success"))) {
                throw new ProviderException("Unifonic rejected: " + response, true, null);
            }
            Object data = response.get("data");
            Object id = data instanceof Map<?, ?> m ? m.get("MessageID") : null;
            return id == null ? "sms-unknown" : String.valueOf(id);
        } catch (RestClientResponseException e) {
            throw ProviderException.of("Unifonic", e);
        } catch (ResourceAccessException e) {
            throw ProviderException.unreachable("Unifonic", e);
        }
    }
}
