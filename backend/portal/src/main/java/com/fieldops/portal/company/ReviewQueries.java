package com.fieldops.portal.company;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fieldops.portal.db.TenantJdbc;
import org.springframework.stereotype.Component;

/** Ratings for the public page: the summary covers every rating, comments only those the owner published. */
@Component
public class ReviewQueries {

    private static final int MAX_SHOWN = 12;

    private final TenantJdbc db;

    public ReviewQueries(TenantJdbc db) {
        this.db = db;
    }

    /** {@code name} is the first name and last initial only ("Sara A."). */
    public record PublicReview(UUID id, int rating, String comment, String name, Instant at) {
    }

    public record PublicReviews(double average, int count, List<PublicReview> items) {
    }

    public PublicReviews forPublicPage(UUID tenantId) {
        return db.read(tenantId, q -> {
            Map<String, Object> p = Map.of("t", tenantId, "max", MAX_SHOWN);
            Map<String, Object> stats = q.queryForMap("""
                    select count(*) as n, coalesce(avg(rating), 0) as avg from visit_reviews where tenant_id = :t
                    """, p);
            List<PublicReview> items = q.query("""
                    select r.id, r.rating, r.comment, c.name, r.created_at
                    from visit_reviews r join customers c on c.id = r.customer_id
                    where r.tenant_id = :t and r.published
                    order by r.created_at desc limit :max
                    """, p, (rs, i) -> new PublicReview(rs.getObject("id", UUID.class), rs.getInt("rating"),
                    rs.getString("comment"), shortName(rs.getString("name")),
                    rs.getTimestamp("created_at").toInstant()));
            double avg = ((Number) stats.get("avg")).doubleValue();
            return new PublicReviews(Math.round(avg * 10) / 10.0, ((Number) stats.get("n")).intValue(), items);
        });
    }

    /** "Sara Al-Qahtani" becomes "Sara A."; customers' full names are not published. */
    static String shortName(String full) {
        if (full == null || full.isBlank()) {
            return null;
        }
        String[] parts = full.trim().split("\\s+");
        if (parts.length == 1) {
            return parts[0];
        }
        String last = parts[parts.length - 1].replaceFirst("^(ال|Al-|al-|Al|al)(?=\\p{L}{2,})", "");
        return parts[0] + " " + last.substring(0, 1).toUpperCase() + ".";
    }
}
