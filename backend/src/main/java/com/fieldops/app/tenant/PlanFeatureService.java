package com.fieldops.app.tenant;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;

/**
 * Answers "does this company's plan include feature X?". Decided from the database only (tenant row and
 * its plan), cached briefly like {@link TenantAccessService}. Call {@link #evict} after a plan change.
 */
@Service
public class PlanFeatureService {

    private static final Duration TTL = Duration.ofSeconds(30);

    private final TenantRepository tenants;
    private final PlanRepository plans;
    private final Clock clock;
    private final Map<UUID, Entry> cache = new ConcurrentHashMap<>();

    public PlanFeatureService(TenantRepository tenants, PlanRepository plans, Clock clock) {
        this.tenants = tenants;
        this.plans = plans;
        this.clock = clock;
    }

    private record Entry(Set<String> features, Instant validUntil) {
    }

    /** For the company of the current request / job. */
    public boolean has(String feature) {
        return has(TenantContext.require(), feature);
    }

    public boolean has(UUID tenantId, String feature) {
        return features(tenantId).contains(feature);
    }

    /** @throws ApiException 403 {@code feature_not_in_plan} (the UI shows the upgrade dialog) */
    public void require(String feature) {
        if (!has(feature)) {
            throw ApiException.forbidden("feature_not_in_plan", "Your plan does not include " + feature);
        }
    }

    public void evict(UUID tenantId) {
        cache.remove(tenantId);
    }

    private Set<String> features(UUID tenantId) {
        Instant now = Instant.now(clock);
        Entry e = cache.get(tenantId);
        if (e == null || !now.isBefore(e.validUntil())) {
            Set<String> loaded = tenants.findById(tenantId)
                    .flatMap(t -> plans.findById(t.getPlanId()))
                    .map(p -> Set.copyOf(p.getFeatures()))
                    .orElse(Set.of());
            e = new Entry(loaded, now.plus(TTL));
            cache.put(tenantId, e);
        }
        return e.features();
    }
}
