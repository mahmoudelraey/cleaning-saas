package com.fieldops.app.notification.provider;

import java.util.List;

import com.fieldops.app.notification.NotificationTemplate;

/**
 * @param toE164   phone in E.164, e.g. +966551234567
 * @param template which message this is (WhatsApp providers send the template mapped to it)
 * @param body     rendered Arabic text (SMS sends it as-is)
 * @param params   template parameters in {@link NotificationTemplate#params()} order
 */
public record OutgoingMessage(String toE164, NotificationTemplate template, String body, List<String> params) {

    public OutgoingMessage {
        params = params == null ? List.of() : params;
    }

    /** Digits only, no "+" (what most providers expect). */
    public String digits() {
        return toE164.replace("+", "");
    }
}
