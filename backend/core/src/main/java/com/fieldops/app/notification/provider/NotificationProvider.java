package com.fieldops.app.notification.provider;

import java.util.List;

import com.fieldops.app.notification.NotificationTemplate;
import com.fieldops.app.notification.channel.ChannelType;

/**
 * A company that delivers messages (Meta, Gupshup, Twilio, Taqnyat, Unifonic). Implementations are stateless:
 * credentials arrive with every call from {@link MessagingProviderService}, so console changes apply without a
 * restart. Must be safe to call from the dispatcher thread.
 */
public interface NotificationProvider {

    ProviderType type();

    /** Settings shown in the console, in display order. */
    List<ProviderField> fields();

    /** Can this provider carry the channel with these settings (required fields present)? */
    default boolean supports(ChannelType channel, ProviderConfig config) {
        return type().channels().contains(channel) && missing(config).isEmpty();
    }

    /** Required fields that are still empty. */
    default List<String> missing(ProviderConfig config) {
        return fields().stream().filter(f -> f.required() && !config.has(f.key())).map(ProviderField::key).toList();
    }

    /**
     * @return the provider's message id
     * @throws ProviderException on failure
     */
    String send(ChannelType channel, ProviderConfig config, OutgoingMessage message);

    /**
     * Console "Send a test". SMS sends a short text; WhatsApp sends the template mapped to OTP with a dummy code
     * (providers with a built-in test template override this).
     */
    default String sendTest(ChannelType channel, ProviderConfig config, String toE164) {
        return send(channel, config, new OutgoingMessage(toE164, NotificationTemplate.OTP,
                "FieldOps: رسالة تجريبية / test message", List.of("123456", "FieldOps")));
    }
}
