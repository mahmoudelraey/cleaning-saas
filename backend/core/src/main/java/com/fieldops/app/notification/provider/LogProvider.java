package com.fieldops.app.notification.provider;

import java.util.List;
import java.util.UUID;

import com.fieldops.app.notification.channel.ChannelType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Used only when no provider is enabled (development): prints the message instead of sending it. */
@Component
public class LogProvider implements NotificationProvider {

    private static final Logger log = LoggerFactory.getLogger(LogProvider.class);

    @Override
    public ProviderType type() {
        return ProviderType.LOG;
    }

    @Override
    public List<ProviderField> fields() {
        return List.of();
    }

    @Override
    public String send(ChannelType channel, ProviderConfig config, OutgoingMessage message) {
        String id = "log-" + UUID.randomUUID();
        log.info("[notification:{}] to {} — {}", message.template(), mask(message.toE164()), message.body());
        return id;
    }

    /** Keeps logs free of full customer phone numbers. */
    static String mask(String phone) {
        return phone == null || phone.length() < 6 ? "***" : phone.substring(0, 6) + "****" + phone.substring(phone.length() - 2);
    }
}
