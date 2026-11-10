package com.fieldops.portal.company;

import java.util.Map;
import java.util.UUID;

import com.fieldops.portal.db.TenantJdbc;
import org.springframework.stereotype.Component;

/** The numbers on the company page's stats band, counted from the company's own data (never typed in). */
@Component
public class StatsQueries {

    private final TenantJdbc db;

    public StatsQueries(TenantJdbc db) {
        this.db = db;
    }

    /**
     * @param satisfactionPercent share of ratings with 4 or 5 stars (one decimal), null without ratings
     */
    public record Stats(long completedVisits, int technicians, Double satisfactionPercent, int ratingCount) {
    }

    public Stats forPublicPage(UUID tenantId) {
        return db.read(tenantId, q -> {
            Map<String, Object> p = Map.of("t", tenantId);
            long visits = q.queryForObject(
                    "select count(*) from bookings where tenant_id = :t and status = 'COMPLETED'", p, Long.class);
            int techs = q.queryForObject(
                    "select count(*) from technicians where tenant_id = :t and active", p, Integer.class);
            Map<String, Object> r = q.queryForMap("""
                    select count(*) as n, count(*) filter (where rating >= 4) as happy
                    from visit_reviews where tenant_id = :t
                    """, p);
            int n = ((Number) r.get("n")).intValue();
            int happy = ((Number) r.get("happy")).intValue();
            Double pct = n == 0 ? null : Math.round(happy * 1000.0 / n) / 10.0;
            return new Stats(visits, techs, pct, n);
        });
    }
}
