package com.fieldops.app.notification;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.notification.channel.ChannelType;
import com.fieldops.app.notification.channel.MessageChannel;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.PlanFeatureService;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Sends due outbox rows. WhatsApp first; on a permanent WhatsApp failure (not on WhatsApp, template
 * rejected) it falls back to SMS immediately; temporary failures retry with back-off. With no provider
 * configured, messages go to the log channel so development works without accounts.
 */
@Component
public class NotificationDispatcher {

    private static final Logger log = LoggerFactory.getLogger(NotificationDispatcher.class);
    private static final int BATCH = 50;

    private final NotificationRepository notifications;
    private final NotificationRefRepository refs;
    private final TenantRepository tenants;
    private final List<MessageChannel> channels;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final PlanFeatureService features;
    private final int limitedMonthlyCap;

    public NotificationDispatcher(NotificationRepository notifications, NotificationRefRepository refs,
                                  TenantRepository tenants, List<MessageChannel> channels, TransactionTemplate tx,
                                  Clock clock, PlanFeatureService features,
                                  @Value("${app.plans.limited-whatsapp-monthly:100}") int limitedMonthlyCap) {
        this.notifications = notifications;
        this.refs = refs;
        this.tenants = tenants;
        this.channels = channels;
        this.tx = tx;
        this.clock = clock;
        this.features = features;
        this.limitedMonthlyCap = limitedMonthlyCap;
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
        Instant monthStart = limitedPlan(tenantId) ? monthStart(tenantId) : null;
        return TenantContext.runAs(tenantId, () -> {
            List<UUID> due = tx.execute(s -> notifications
                    .findDue(Notification.Status.PENDING, Instant.now(clock), PageRequest.of(0, BATCH))
                    .stream().map(Notification::getId).toList());
            int sent = 0;
            for (UUID id : due == null ? List.<UUID>of() : due) {
                Boolean ok = tx.execute(s -> sendOne(id, tenantId, monthStart));
                if (Boolean.TRUE.equals(ok)) {
                    sent++;
                }
            }
            return sent;
        });
    }

    /** @param capFrom start of the month when the plan has a monthly message cap, else null */
    private boolean sendOne(UUID notificationId, UUID tenantId, Instant capFrom) {
        Notification n = notifications.findById(notificationId).orElse(null);
        if (n == null || n.getStatus() != Notification.Status.PENDING) {
            return false;
        }
        // Basic plan: automatic customer messages are capped per month. OTP codes are never capped,
        // otherwise customers could not verify their phone on the booking page.
        if (capFrom != null && n.getTemplate() != NotificationTemplate.OTP
                && notifications.countSentSince(capFrom, NotificationTemplate.OTP) >= limitedMonthlyCap) {
            n.markSkipped("monthly_limit");
            return false;
        }
        List<MessageChannel> chain = chainFor(n.getTemplate());
        Instant now = Instant.now(clock);
        for (int i = 0; i < chain.size(); i++) {
            MessageChannel channel = chain.get(i);
            try {
                String providerId = channel.send(n.getToPhone(), n.getTemplate(), n.getBody(), n.getParams());
                n.markSent(channel.type(), providerId, now);
                if (channel.type() != ChannelType.LOG && providerId != null) {
                    refs.save(new NotificationRef(providerId, tenantId, n.getId()));
                }
                return true;
            } catch (MessageChannel.ChannelException e) {
                boolean hasFallback = i < chain.size() - 1;
                log.warn("Notification {} via {} failed (permanent={}): {}", n.getId(), channel.type(), e.isPermanent(),
                        e.getMessage());
                if (e.isPermanent() && hasFallback) {
                    continue; // try the next channel right away
                }
                n.markFailed(channel.type(), e.getMessage(), e.isPermanent(), now);
                return false;
            } catch (RuntimeException e) {
                log.error("Unexpected error sending notification {}", n.getId(), e);
                n.markFailed(channel.type(), e.getClass().getSimpleName(), false, now);
                return false;
            }
        }
        return false;
    }

    private boolean limitedPlan(UUID tenantId) {
        return features.has(tenantId, PlanFeature.WHATSAPP_LIMITED) && !features.has(tenantId, PlanFeature.WHATSAPP);
    }

    /** First instant of the current calendar month in the company's time zone. */
    private Instant monthStart(UUID tenantId) {
        ZoneId zone = tenants.findById(tenantId).map(t -> ZoneId.of(t.getTimezone())).orElse(ZoneId.of("Asia/Riyadh"));
        return LocalDate.now(clock.withZone(zone)).withDayOfMonth(1).atStartOfDay(zone).toInstant();
    }

    /** OTP prefers SMS (WhatsApp needs a special authentication template); everything else prefers WhatsApp. */
    List<MessageChannel> chainFor(NotificationTemplate template) {
        MessageChannel whatsapp = find(ChannelType.WHATSAPP);
        MessageChannel sms = find(ChannelType.SMS);
        List<MessageChannel> chain = new ArrayList<>();
        if (template == NotificationTemplate.OTP) {
            add(chain, sms);
            add(chain, whatsapp);
        } else {
            add(chain, whatsapp);
            add(chain, sms);
        }
        if (chain.isEmpty()) {
            chain.add(find(ChannelType.LOG));
        }
        return chain;
    }

    private MessageChannel find(ChannelType type) {
        return channels.stream().filter(c -> c.type() == type).findFirst().orElse(null);
    }

    private static void add(List<MessageChannel> chain, MessageChannel c) {
        if (c != null && c.isEnabled()) {
            chain.add(c);
        }
    }
}
