package com.fieldops.app.platform;

import java.util.List;
import java.util.UUID;

import com.fieldops.app.tenant.PlanFeatureService;
import com.fieldops.app.tenant.TenantAccessService;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Paid periods set in the console: when {@code paid_until} passes the company becomes PAST_DUE (still usable),
 * and after the grace period (Platform → Settings) it is SUSPENDED until the owner renews it.
 */
@Component
public class SubscriptionJobs {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionJobs.class);

    private final JdbcTemplate jdbc;
    private final PlatformSettingsService settings;
    private final TenantAccessService access;
    private final PlanFeatureService features;

    public SubscriptionJobs(JdbcTemplate jdbc, PlatformSettingsService settings, TenantAccessService access,
                            PlanFeatureService features) {
        this.jdbc = jdbc;
        this.settings = settings;
        this.access = access;
        this.features = features;
    }

    @Scheduled(fixedDelayString = "${app.jobs.subscription-delay:PT15M}", initialDelayString = "PT2M")
    @SchedulerLock(name = "platform.subscriptions", lockAtMostFor = "PT10M")
    public void expire() {
        List<UUID> pastDue = jdbc.queryForList("""
                update tenants set status = 'PAST_DUE', updated_at = now()
                where not platform and status = 'ACTIVE' and paid_until is not null and paid_until < now()
                returning id""", UUID.class);
        List<UUID> suspended = jdbc.queryForList("""
                update tenants set status = 'SUSPENDED', status_note = 'Subscription expired', updated_at = now()
                where not platform and status = 'PAST_DUE' and paid_until is not null
                  and paid_until + make_interval(days => ?) < now()
                returning id""", UUID.class, settings.graceDays());
        for (UUID id : pastDue) {
            record(id, "PAST_DUE");
        }
        for (UUID id : suspended) {
            record(id, "SUSPENDED_EXPIRED");
        }
        if (!pastDue.isEmpty() || !suspended.isEmpty()) {
            log.info("Subscriptions: {} past due, {} suspended", pastDue.size(), suspended.size());
        }
    }

    private void record(UUID id, String action) {
        access.evict(id);
        features.evict(id);
        jdbc.update("insert into platform_audit (id, tenant_id, action, actor_name) values (?, ?, ?, 'system')",
                UUID.randomUUID(), id, action);
    }
}
