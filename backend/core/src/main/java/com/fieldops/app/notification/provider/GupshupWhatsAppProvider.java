package com.fieldops.app.notification.provider;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldops.app.notification.channel.ChannelType;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * WhatsApp through Gupshup (a Meta business solution provider). Sends approved templates by their Gupshup
 * template ID: {@code POST /wa/api/v1/template/msg} with the {@code apikey} header.
 * Docs: docs.gupshup.io/docs/template-messages
 */
@Component
public class GupshupWhatsAppProvider implements NotificationProvider {

    static final String API_KEY = "apiKey";
    static final String SOURCE = "source";
    static final String APP_NAME = "appName";

    private static final List<ProviderField> FIELDS = List.of(
            ProviderField.secret(API_KEY, "API key", true),
            ProviderField.text(SOURCE, "Source WhatsApp number", true, "9665XXXXXXXX"),
            ProviderField.text(APP_NAME, "App name (src.name)", true, null),
            ProviderField.apiUrl("https://api.gupshup.io"));

    private final RestClient http;
    private final ObjectMapper json;

    public GupshupWhatsAppProvider(RestClient.Builder builder, ObjectMapper json) {
        this.http = builder.build();
        this.json = json;
    }

    @Override
    public ProviderType type() {
        return ProviderType.GUPSHUP_WHATSAPP;
    }

    @Override
    public List<ProviderField> fields() {
        return FIELDS;
    }

    @Override
    @SuppressWarnings("unchecked")
    public String send(ChannelType channel, ProviderConfig config, OutgoingMessage message) {
        String templateId = config.template(message.template());
        if (templateId == null) {
            throw ProviderException.missingTemplate("Gupshup", message.template().name());
        }
        List<String> params = new ArrayList<>();
        for (String p : message.params()) {
            params.add(p == null || p.isBlank() ? "-" : p);
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("channel", "whatsapp");
        form.add("source", config.get(SOURCE).replace("+", ""));
        form.add("destination", message.digits());
        form.add("src.name", config.get(APP_NAME));
        form.add("template", toJson(Map.of("id", templateId, "params", params)));
        try {
            Map<String, Object> response = http.post()
                    .uri(config.url("https://api.gupshup.io") + "/wa/api/v1/template/msg")
                    .header("apikey", config.get(API_KEY))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
            // Gupshup can answer 2xx with {"status":"error","message":...}.
            Object status = response == null ? null : response.get("status");
            if (!"submitted".equals(status) || response.get("messageId") == null) {
                throw new ProviderException("Gupshup rejected: " + response, true, null);
            }
            return String.valueOf(response.get("messageId"));
        } catch (RestClientResponseException e) {
            throw ProviderException.of("Gupshup", e);
        } catch (ResourceAccessException e) {
            throw ProviderException.unreachable("Gupshup", e);
        }
    }

    private String toJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new ProviderException("Gupshup: could not encode template", true, e);
        }
    }
}
