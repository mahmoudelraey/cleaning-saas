package com.fieldops.app.notification.provider;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashMap;
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
 * Twilio Messages API for both SMS and WhatsApp ({@code POST /2010-04-01/Accounts/{sid}/Messages.json}, basic auth).
 * SMS sends the text from a number / alphanumeric sender or a Messaging Service. WhatsApp sends an approved
 * Content template ({@code ContentSid HX…}) with numbered variables {@code {"1": …, "2": …}}.
 * Each channel is available only when its sender is filled in.
 * Docs: twilio.com/docs/messaging/api/message-resource
 */
@Component
public class TwilioProvider implements NotificationProvider {

    static final String ACCOUNT_SID = "accountSid";
    static final String AUTH_TOKEN = "authToken";
    static final String SMS_FROM = "smsFrom";
    static final String MESSAGING_SERVICE_SID = "messagingServiceSid";
    static final String WHATSAPP_FROM = "whatsappFrom";

    private static final List<ProviderField> FIELDS = List.of(
            ProviderField.text(ACCOUNT_SID, "Account SID", true, "AC…"),
            ProviderField.secret(AUTH_TOKEN, "Auth token", true),
            ProviderField.text(WHATSAPP_FROM, "WhatsApp sender number (for WhatsApp)", false, "+9665XXXXXXXX"),
            ProviderField.text(SMS_FROM, "SMS sender (number or sender ID)", false, null),
            ProviderField.text(MESSAGING_SERVICE_SID, "Messaging Service SID (instead of SMS sender)", false, "MG…"),
            ProviderField.apiUrl("https://api.twilio.com"));

    private final RestClient http;
    private final ObjectMapper json;

    public TwilioProvider(RestClient.Builder builder, ObjectMapper json) {
        this.http = builder.build();
        this.json = json;
    }

    @Override
    public ProviderType type() {
        return ProviderType.TWILIO;
    }

    @Override
    public List<ProviderField> fields() {
        return FIELDS;
    }

    @Override
    public boolean supports(ChannelType channel, ProviderConfig config) {
        if (!NotificationProvider.super.supports(channel, config)) {
            return false;
        }
        return switch (channel) {
            case WHATSAPP -> config.has(WHATSAPP_FROM);
            case SMS -> config.has(SMS_FROM) || config.has(MESSAGING_SERVICE_SID);
            default -> false;
        };
    }

    @Override
    @SuppressWarnings("unchecked")
    public String send(ChannelType channel, ProviderConfig config, OutgoingMessage message) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        if (channel == ChannelType.WHATSAPP) {
            String contentSid = config.template(message.template());
            if (contentSid == null) {
                throw ProviderException.missingTemplate("Twilio WhatsApp", message.template().name());
            }
            form.add("To", "whatsapp:" + message.toE164());
            form.add("From", "whatsapp:" + plus(config.get(WHATSAPP_FROM)));
            form.add("ContentSid", contentSid);
            Map<String, String> variables = new LinkedHashMap<>();
            for (int i = 0; i < message.params().size(); i++) {
                String p = message.params().get(i);
                variables.put(String.valueOf(i + 1), p == null || p.isBlank() ? "-" : p);
            }
            form.add("ContentVariables", toJson(variables));
        } else {
            form.add("To", message.toE164());
            if (config.has(MESSAGING_SERVICE_SID)) {
                form.add("MessagingServiceSid", config.get(MESSAGING_SERVICE_SID));
            } else {
                form.add("From", config.get(SMS_FROM));
            }
            form.add("Body", message.body());
        }
        String basic = Base64.getEncoder().encodeToString(
                (config.get(ACCOUNT_SID) + ":" + config.get(AUTH_TOKEN)).getBytes(StandardCharsets.UTF_8));
        try {
            Map<String, Object> response = http.post()
                    .uri(config.url("https://api.twilio.com") + "/2010-04-01/Accounts/{sid}/Messages.json",
                            config.get(ACCOUNT_SID))
                    .header("Authorization", "Basic " + basic)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
            Object sid = response == null ? null : response.get("sid");
            if (sid == null) {
                throw new ProviderException("Twilio returned no message sid: " + response, false, null);
            }
            return String.valueOf(sid);
        } catch (RestClientResponseException e) {
            throw ProviderException.of("Twilio", e);
        } catch (ResourceAccessException e) {
            throw ProviderException.unreachable("Twilio", e);
        }
    }

    private static String plus(String phone) {
        String p = phone.replace("whatsapp:", "").trim();
        return p.startsWith("+") ? p : "+" + p;
    }

    private String toJson(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new ProviderException("Twilio: could not encode variables", true, e);
        }
    }
}
