package com.fieldops.app.notification.provider;

import java.util.EnumSet;
import java.util.Set;

import com.fieldops.app.notification.channel.ChannelType;

/** Message providers the platform can send through. Stored by name in {@code messaging_providers.provider}. */
public enum ProviderType {

    META_WHATSAPP("Meta WhatsApp Cloud API", EnumSet.of(ChannelType.WHATSAPP), 10),
    GUPSHUP_WHATSAPP("Gupshup WhatsApp", EnumSet.of(ChannelType.WHATSAPP), 20),
    TWILIO("Twilio (WhatsApp + SMS)", EnumSet.of(ChannelType.WHATSAPP, ChannelType.SMS), 30),
    TAQNYAT_SMS("Taqnyat SMS", EnumSet.of(ChannelType.SMS), 40),
    UNIFONIC_SMS("Unifonic SMS", EnumSet.of(ChannelType.SMS), 50),
    /** Development only: writes the message to the application log. Not shown in the console. */
    LOG("Log (development)", EnumSet.of(ChannelType.LOG), 1000);

    private final String displayName;
    private final Set<ChannelType> channels;
    private final int defaultPriority;

    ProviderType(String displayName, Set<ChannelType> channels, int defaultPriority) {
        this.displayName = displayName;
        this.channels = channels;
        this.defaultPriority = defaultPriority;
    }

    public String displayName() {
        return displayName;
    }

    /** Channels this provider can carry once configured. */
    public Set<ChannelType> channels() {
        return channels;
    }

    public int defaultPriority() {
        return defaultPriority;
    }

    public boolean usesTemplates() {
        return channels.contains(ChannelType.WHATSAPP);
    }
}
