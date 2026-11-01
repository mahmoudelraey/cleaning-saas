package com.fieldops.app.tenant;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

/**
 * Answers "may this company use the app right now?" on every authenticated request.
 *
 * <p>The decision is made only from the database row and the server clock; nothing the client sends
 * (response fields, JWT claims, browser time) takes part. Results are cached briefly to avoid a DB hit
 * per request, but a cached "yes" never outlives the trial end, so access stops exactly on time.
 * Call {@link #evict} whenever a tenant's status changes (suspension, payment, plan change).
 */
@Service
public class TenantAccessService {

    private static final Duration TTL = Duration.ofSeconds(30);

    private final TenantRepository tenants;
    private final Clock clock;
    private final Map<UUID, Entry> cache = new ConcurrentHashMap<>();

    public TenantAccessService(TenantRepository tenants, Clock clock) {
        this.tenants = tenants;
        this.clock = clock;
    }

    private record Entry(boolean usable, Instant validUntil) {
    }

    public boolean isUsable(UUID tenantId) {
        Instant now = Instant.now(clock);
        Entry entry = cache.get(tenantId);
        if (entry == null || !now.isBefore(entry.validUntil())) {
            entry = load(tenantId, now);
            cache.put(tenantId, entry);
        }
        return entry.usable();
    }

    public void evict(UUID tenantId) {
        cache.remove(tenantId);
    }

    private Entry load(UUID tenantId, Instant now) {
        Tenant tenant = tenants.findById(tenantId).orElse(null);
        if (tenant == null) {
            return new Entry(false, now.plus(TTL));
        }
        boolean usable = tenant.isUsable(now);
        Instant validUntil = now.plus(TTL);
        if (usable && tenant.getStatus() == TenantStatus.TRIAL && tenant.getTrialEndsAt().isBefore(validUntil)) {
            validUntil = tenant.getTrialEndsAt();
        }
        return new Entry(usable, validUntil);
    }
}
