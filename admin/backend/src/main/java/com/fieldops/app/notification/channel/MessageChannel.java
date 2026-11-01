package com.fieldops.app.notification.channel;

import java.util.List;

import com.fieldops.app.notification.NotificationTemplate;

/** A way to reach the customer's phone. Implementations must be safe to call from the dispatcher thread. */
public interface MessageChannel {

    ChannelType type();

    /** Configured with credentials and switched on? */
    boolean isEnabled();

    /**
     * @param toE164 phone in E.164, e.g. +966551234567
     * @param body   rendered Arabic text (SMS uses it as-is)
     * @param params template parameters in {@link NotificationTemplate#params()} order (WhatsApp templates)
     * @return provider message id
     * @throws ChannelException on failure; {@link ChannelException#isPermanent()} decides retry vs. fallback
     */
    String send(String toE164, NotificationTemplate template, String body, List<String> params);

    class ChannelException extends RuntimeException {
        private final boolean permanent;

        public ChannelException(String message, boolean permanent, Throwable cause) {
            super(message, cause);
            this.permanent = permanent;
        }

        public boolean isPermanent() {
            return permanent;
        }
    }
}
