package com.fieldops.app.notification.channel;

import java.util.List;
import java.util.UUID;

import com.fieldops.app.notification.NotificationTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Default in development: prints the message instead of sending it. Always enabled, used last. */
@Component
public class LogMessageChannel implements MessageChannel {

    private static final Logger log = LoggerFactory.getLogger(LogMessageChannel.class);

    @Override
    public ChannelType type() {
        return ChannelType.LOG;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }

    @Override
    public String send(String toE164, NotificationTemplate template, String body, List<String> params) {
        String id = "log-" + UUID.randomUUID();
        log.info("[notification:{}] to {} — {}", template, mask(toE164), body);
        return id;
    }

    /** Keeps logs free of full customer phone numbers. */
    static String mask(String phone) {
        return phone == null || phone.length() < 6 ? "***" : phone.substring(0, 6) + "****" + phone.substring(phone.length() - 2);
    }
}
