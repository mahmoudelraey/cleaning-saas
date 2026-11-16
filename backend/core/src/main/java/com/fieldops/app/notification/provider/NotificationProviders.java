package com.fieldops.app.notification.provider;

import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import com.fieldops.app.notification.channel.ChannelType;
import org.springframework.stereotype.Component;

/** All provider beans plus their settings: which providers may carry a channel right now, in priority order. */
@Component
public class NotificationProviders {

    /** A provider together with the settings it sends with. */
    public record Active(NotificationProvider provider, ProviderConfig config) {
    }

    private final Map<ProviderType, NotificationProvider> providers = new EnumMap<>(ProviderType.class);
    private final MessagingProviderService settings;

    public NotificationProviders(List<NotificationProvider> beans, MessagingProviderService settings) {
        for (NotificationProvider p : beans) {
            providers.put(p.type(), p);
        }
        this.settings = settings;
    }

    public NotificationProvider get(ProviderType type) {
        NotificationProvider p = providers.get(type);
        if (p == null) {
            throw new IllegalArgumentException("No provider bean for " + type);
        }
        return p;
    }

    /** Providers shown in the console (everything except the development log). */
    public List<NotificationProvider> configurable() {
        return providers.values().stream().filter(p -> p.type() != ProviderType.LOG).toList();
    }

    /** Enabled providers that are configured for the channel, lowest priority number first. */
    public List<Active> ready(ChannelType channel) {
        return settings.all().values().stream()
                .filter(c -> c.type() != ProviderType.LOG && c.enabled())
                .filter(c -> providers.containsKey(c.type()) && providers.get(c.type()).supports(channel, c))
                .sorted(Comparator.comparingInt(ProviderConfig::priority).thenComparing(ProviderConfig::type))
                .map(c -> new Active(providers.get(c.type()), c))
                .toList();
    }

    public boolean available(ChannelType channel) {
        return !ready(channel).isEmpty();
    }

    /** The development fallback used when nothing is enabled. */
    public Active log() {
        return new Active(get(ProviderType.LOG), settings.config(ProviderType.LOG));
    }
}
