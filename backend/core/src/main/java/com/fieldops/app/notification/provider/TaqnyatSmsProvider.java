package com.fieldops.app.notification.provider;

import java.util.List;
import java.util.Map;

import com.fieldops.app.notification.channel.ChannelType;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * SMS through Taqnyat (Saudi): {@code POST /v1/messages} with a bearer token and JSON
 * {@code {recipients, body, sender}}. The sender name must be active on the Taqnyat account (CST rules).
 * Docs: dev.taqnyat.sa/en/doc/sms
 */
@Component
public class TaqnyatSmsProvider implements NotificationProvider {

    static final String BEARER_TOKEN = "bearerToken";
    static final String SENDER = "sender";

    private static final List<ProviderField> FIELDS = List.of(
            ProviderField.secret(BEARER_TOKEN, "Bearer token", true),
            ProviderField.text(SENDER, "Sender name", true, null),
            ProviderField.apiUrl("https://api.taqnyat.sa"));

    private final RestClient http;

    public TaqnyatSmsProvider(RestClient.Builder builder) {
        this.http = builder.build();
    }

    @Override
    public ProviderType type() {
        return ProviderType.TAQNYAT_SMS;
    }

    @Override
    public List<ProviderField> fields() {
        return FIELDS;
    }

    @Override
    @SuppressWarnings("unchecked")
    public String send(ChannelType channel, ProviderConfig config, OutgoingMessage message) {
        Map<String, Object> payload = Map.of(
                "recipients", List.of(message.digits()),
                "body", message.body(),
                "sender", config.get(SENDER));
        try {
            Map<String, Object> response = http.post()
                    .uri(config.url("https://api.taqnyat.sa") + "/v1/messages")
                    .header("Authorization", "Bearer " + config.get(BEARER_TOKEN))
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(Map.class);
            Object id = response == null ? null : response.get("messageId");
            if (id == null) {
                throw new ProviderException("Taqnyat rejected: " + response, true, null);
            }
            return String.valueOf(id);
        } catch (RestClientResponseException e) {
            throw ProviderException.of("Taqnyat", e);
        } catch (ResourceAccessException e) {
            throw ProviderException.unreachable("Taqnyat", e);
        }
    }
}
