package com.fieldops.app.notification;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.notification.channel.ChannelType;
import com.fieldops.app.notification.provider.NotificationProviders;
import com.fieldops.app.notification.provider.OutgoingMessage;
import com.fieldops.app.notification.provider.ProviderException;
import com.fieldops.app.notification.provider.ProviderType;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sends due outbox rows through the providers the platform admin enabled (Platform → Settings → Messaging).
 * Status messages try every ready WhatsApp provider in priority order, then every SMS provider; OTP codes go
 * SMS first. Any failure moves on to the next provider immediately; when all fail, the message is retried later
 * with back-off unless every provider refused it for good (not on WhatsApp, template rejected, bad number).
 * With no provider enabled, messages go to the log so development works without accounts.
 */
@Component
public class NotificationDispatcher {

    private static final Logger log = LoggerFactory.getLogger(NotificationDispatcher.class);
    private static final int BATCH = 50;

    private final NotificationRepository notifications;
    private final NotificationRefRepository refs;
    private final TenantRepository tenants;
    private final NotificationProviders providers;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final com.fieldops.app.tenant.PlanLimitService limits;

    public NotificationDispatcher(NotificationRepository notifications, NotificationRefRepository refs,
                                  TenantRepository tenants, NotificationProviders providers, TransactionTemplate tx,
                                  Clock clock, com.fieldops.app.tenant.PlanLimitService limits) {
        this.notifications = notifications;
        this.refs = refs;
        this.tenants = tenants;
        this.providers = providers;
        this.tx = tx;
        this.clock = clock;
        this.limits = limits;
    }

    /** One pass over all companies. Called by {@link NotificationJobs}; public for tests. */
    public int dispatchAll() {
        int sent = 0;
        Instant now = Instant.now(clock);
        for (Tenant t : tenants.findAll()) {
            if (t.isUsable(now)) {
                sent += dispatchTenant(t.getId());
            }
        }
        return sent;
    }

    public int dispatchTenant(UUID tenantId) {
        Integer cap = limits.limits(tenantId).monthlyMessages(); // null = unlimited
        Instant monthStart = cap != null ? limits.monthStart(tenantId) : null;
        return TenantContext.runAs(tenantId, () -> {
            List<UUID> due = tx.execute(s -> notifications
                    .findDue(Notification.Status.PENDING, Instant.now(clock), PageRequest.of(0, BATCH))
                    .stream().map(Notification::getId).toList());
            int sent = 0;
            for (UUID id : due == null ? List.<UUID>of() : due) {
                Boolean ok = tx.execute(s -> sendOne(id, tenantId, monthStart, cap));
                if (Boolean.TRUE.equals(ok)) {
                    sent++;
                }
            }
            return sent;
        });
    }

    /**
     * @param capFrom start of the month when the company has a monthly message cap, else null
     * @param cap     messages allowed per month (plan or company override)
     */
    private boolean sendOne(UUID notificationId, UUID tenantId, Instant capFrom, Integer cap) {
        Notification n = notifications.findById(notificationId).orElse(null);
        if (n == null || n.getStatus() != Notification.Status.PENDING) {
            return false;
        }
        // Automatic customer messages are capped per month by the plan. OTP codes are never capped,
        // otherwise customers could not verify their phone on the booking page.
        if (capFrom != null && n.getTemplate() != NotificationTemplate.OTP
                && notifications.countSentSince(capFrom, NotificationTemplate.OTP) >= cap) {
            n.markSkipped("monthly_limit");
            return false;
        }
        List<Step> chain = chainFor(n.getTemplate());
        OutgoingMessage message = new OutgoingMessage(n.getToPhone(), n.getTemplate(), n.getBody(), n.getParams());
        Instant now = Instant.now(clock);
        List<String> errors = new ArrayList<>();
        boolean allPermanent = true;
        Step last = null;
        for (Step step : chain) {
            last = step;
            ProviderType provider = step.active().provider().type();
            try {
                String providerId = step.active().provider().send(step.channel(), step.active().config(), message);
                n.markSent(step.channel(), provider, providerId, now);
                if (provider != ProviderType.LOG && providerId != null) {
                    refs.save(new NotificationRef(providerId, tenantId, n.getId()));
                }
                return true;
            } catch (ProviderException e) {
                log.warn("Notification {} via {}/{} failed (permanent={}): {}", n.getId(), provider, step.channel(),
                        e.isPermanent(), e.getMessage());
                errors.add(provider + ": " + e.getMessage());
                allPermanent &= e.isPermanent();
            } catch (RuntimeException e) {
                log.error("Unexpected error sending notification {} via {}", n.getId(), provider, e);
                errors.add(provider + ": " + e.getClass().getSimpleName());
                allPermanent = false;
            }
            // Next provider right away. A timeout after the provider accepted the message can rarely mean the
            // customer gets it twice; preferred over not delivering while one provider is down.
        }
        if (last != null) {
            // Retry later (whole chain again) unless every provider refused for good.
            n.markFailed(last.channel(), last.active().provider().type(), String.join(" | ", errors), allPermanent, now);
        }
        return false;
    }

    /** One attempt: a provider on a channel (Twilio can appear twice, once for WhatsApp and once for SMS). */
    record Step(ChannelType channel, NotificationProviders.Active active) {
    }

    /** OTP prefers SMS (WhatsApp needs a special authentication template); everything else prefers WhatsApp. */
    List<Step> chainFor(NotificationTemplate template) {
        List<Step> chain = new ArrayList<>();
        List<ChannelType> order = template == NotificationTemplate.OTP
                ? List.of(ChannelType.SMS, ChannelType.WHATSAPP)
                : List.of(ChannelType.WHATSAPP, ChannelType.SMS);
        for (ChannelType channel : order) {
            for (NotificationProviders.Active a : providers.ready(channel)) {
                chain.add(new Step(channel, a));
            }
        }
        if (chain.isEmpty()) {
            chain.add(new Step(ChannelType.LOG, providers.log()));
        }
        return chain;
    }
}
