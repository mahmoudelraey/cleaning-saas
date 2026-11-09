package com.fieldops.portal.booking;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.fieldops.portal.db.TenantJdbc;
import com.fieldops.portal.security.CurrentCustomer;
import com.fieldops.app.common.web.ApiException;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** What a customer may see about their own bookings. Internal notes and staff notes are never selected. */
@Component
public class BookingQueries {

    static final Set<String> OPEN = Set.of("NEW", "CONFIRMED", "ASSIGNED", "ON_THE_WAY", "IN_PROGRESS");
    static final Set<String> CANCELLABLE = Set.of("NEW", "CONFIRMED", "ASSIGNED");
    /** Timeline entries shown to the customer (no staff notes, edits or photo uploads). */
    private static final List<String> VISIBLE_EVENTS = List.of("CREATED", "STATUS_CHANGED", "ASSIGNED", "RESCHEDULED",
            "INVOICE_ISSUED");

    /** The booking's address as one line, same format as the admin app ("Home، Riyadh، Al Malqa، …"). */
    private static final String ADDRESS_TEXT = """
            nullif(concat_ws('، ', nullif(ad.label, ''), nullif(ad.city, ''), nullif(ad.district, ''),
                   nullif(ad.details, '')), '')""";

    private final TenantJdbc db;

    public BookingQueries(TenantJdbc db) {
        this.db = db;
    }

    public record Technician(String name, String color) {
    }

    public record Summary(UUID id, long number, String status, Instant scheduledStart, Instant scheduledEnd,
                          long subtotalHalalas, String addressText, String paymentMethod, List<String> services,
                          List<String> servicesEn, List<Technician> technicians) {
    }

    /**
     * {@code description} (Arabic) and {@code descriptionEn} are read from the service and add-on names;
     * {@code descriptionEn} is null when there is no English name.
     */
    public record Item(String description, String descriptionEn, java.math.BigDecimal quantity, long totalHalalas,
                       boolean addon) {
    }

    public record Event(String type, String fromStatus, String toStatus, String note, Instant at) {
    }

    public record InvoiceRef(UUID id, long number, String status, long totalHalalas, long paidHalalas) {
    }

    /** The customer's own rating of this visit; {@code published} = shown on the company's public page. */
    public record Review(int rating, String comment, boolean published) {
    }

    public record Detail(Summary booking, String notes, String cancelReason, String navigationUrl, List<Item> items,
                         List<Event> events, InvoiceRef invoice, boolean canCancel, Instant cancelDeadline,
                         boolean canReview, Review review) {
    }

    public List<Summary> list(CurrentCustomer me, boolean upcoming) {
        return db.read(me.tenantId(), q -> {
            Map<String, Object> p = new HashMap<>(Map.of("t", me.tenantId(), "c", me.customerId(), "open", OPEN));
            String sql = """
                    select b.id, b.number, b.status, b.scheduled_start, b.scheduled_end, b.subtotal_halalas,
                           %s as address_text, b.payment_method
                    from bookings b left join addresses ad on ad.id = b.address_id
                    where b.tenant_id = :t and b.customer_id = :c and b.status %s (:open)
                    order by b.scheduled_start %s limit 100
                    """.formatted(ADDRESS_TEXT, upcoming ? "in" : "not in", upcoming ? "asc" : "desc");
            List<Summary> rows = q.query(sql, p, (rs, i) -> new Summary(rs.getObject("id", UUID.class), rs.getLong("number"),
                    rs.getString("status"), rs.getTimestamp("scheduled_start").toInstant(),
                    rs.getTimestamp("scheduled_end").toInstant(), rs.getLong("subtotal_halalas"), rs.getString("address_text"),
                    rs.getString("payment_method"), List.of(), List.of(), List.of()));
            return withServicesAndTechnicians(q, me.tenantId(), rows);
        });
    }

    public Detail detail(CurrentCustomer me, UUID bookingId, int cancelNoticeHours) {
        return db.read(me.tenantId(), q -> {
            Map<String, Object> p = Map.of("t", me.tenantId(), "c", me.customerId(), "b", bookingId);
            List<Object[]> extra = new ArrayList<>();
            List<Summary> rows = q.query("""
                    select b.id, b.number, b.status, b.scheduled_start, b.scheduled_end, b.subtotal_halalas,
                           %s as address_text, b.payment_method, b.notes, b.cancel_reason,
                           ad.lat as address_lat, ad.lng as address_lng, ad.map_url as address_map_url
                    from bookings b left join addresses ad on ad.id = b.address_id
                    where b.tenant_id = :t and b.customer_id = :c and b.id = :b
                    """.formatted(ADDRESS_TEXT), p, (rs, i) -> {
                extra.add(new Object[] {rs.getString("notes"), rs.getString("cancel_reason"),
                        navigationUrl(rs.getBigDecimal("address_lat"), rs.getBigDecimal("address_lng"),
                                rs.getString("address_map_url"))});
                return new Summary(rs.getObject("id", UUID.class), rs.getLong("number"), rs.getString("status"),
                        rs.getTimestamp("scheduled_start").toInstant(), rs.getTimestamp("scheduled_end").toInstant(),
                        rs.getLong("subtotal_halalas"), rs.getString("address_text"), rs.getString("payment_method"),
                        List.of(), List.of(), List.of());
            });
            if (rows.isEmpty()) {
                throw ApiException.notFound("booking"); // also when it belongs to someone else
            }
            Summary b = withServicesAndTechnicians(q, me.tenantId(), rows).get(0);
            List<Item> items = q.query("""
                    select case when bi.addon_id is null then s.name else s.name || ' — ' || a.name end as description,
                           bi.quantity, bi.total_halalas, bi.addon_id is not null as addon,
                           case when bi.addon_id is null then s.name_en
                                when s.name_en is not null and a.name_en is not null then s.name_en || ' — ' || a.name_en
                           end as description_en
                    from booking_items bi
                    left join services s on s.id = bi.service_id
                    left join service_addons a on a.id = bi.addon_id
                    where bi.tenant_id = :t and bi.booking_id = :b order by bi.position
                    """, p, (rs, i) -> new Item(rs.getString("description"), rs.getString("description_en"),
                    rs.getBigDecimal("quantity"), rs.getLong("total_halalas"), rs.getBoolean("addon")));
            Map<String, Object> ep = new HashMap<>(p);
            ep.put("types", VISIBLE_EVENTS);
            List<Event> events = q.query("""
                    select type, from_status, to_status, note, created_at from visit_events
                    where tenant_id = :t and booking_id = :b and type in (:types) order by created_at
                    """, ep, (rs, i) -> new Event(rs.getString("type"), rs.getString("from_status"),
                    rs.getString("to_status"), customerSafeNote(rs.getString("type"), rs.getString("note")),
                    rs.getTimestamp("created_at").toInstant()));
            List<InvoiceRef> inv = q.query("""
                    select id, number, status, total_halalas, paid_halalas from invoices
                    where tenant_id = :t and booking_id = :b and customer_id = :c and status <> 'VOID'
                    order by issued_at desc limit 1
                    """, p, (rs, i) -> new InvoiceRef(rs.getObject("id", UUID.class), rs.getLong("number"),
                    rs.getString("status"), rs.getLong("total_halalas"), rs.getLong("paid_halalas")));
            Instant deadline = b.scheduledStart().minusSeconds(cancelNoticeHours * 3600L);
            boolean canCancel = CANCELLABLE.contains(b.status()) && Instant.now().isBefore(deadline);
            List<Review> review = q.query("""
                    select rating, comment, published from visit_reviews
                    where tenant_id = :t and booking_id = :b and customer_id = :c
                    """, p, (rs, i) -> new Review(rs.getInt("rating"), rs.getString("comment"), rs.getBoolean("published")));
            Object[] x = extra.get(0);
            return new Detail(b, (String) x[0], (String) x[1], (String) x[2], items, events,
                    inv.isEmpty() ? null : inv.get(0), canCancel, deadline, "COMPLETED".equals(b.status()),
                    review.isEmpty() ? null : review.get(0));
        });
    }

    private static List<Summary> withServicesAndTechnicians(NamedParameterJdbcTemplate q, UUID tenantId, List<Summary> rows) {
        if (rows.isEmpty()) {
            return rows;
        }
        List<UUID> ids = rows.stream().map(Summary::id).toList();
        Map<String, Object> p = Map.of("t", tenantId, "ids", ids);
        Map<UUID, List<String>> services = new LinkedHashMap<>();
        // Same order as `services`; an entry is null when that service has no English name.
        Map<UUID, List<String>> servicesEn = new LinkedHashMap<>();
        q.query("""
                select bi.booking_id, s.name as description, s.name_en from booking_items bi
                left join services s on s.id = bi.service_id
                where bi.tenant_id = :t and bi.booking_id in (:ids) and bi.addon_id is null order by bi.position
                """, p, rs -> {
            UUID id = rs.getObject("booking_id", UUID.class);
            services.computeIfAbsent(id, k -> new ArrayList<>()).add(rs.getString("description"));
            servicesEn.computeIfAbsent(id, k -> new ArrayList<>()).add(rs.getString("name_en"));
        });
        Map<UUID, List<Technician>> techs = new LinkedHashMap<>();
        q.query("""
                select a.booking_id, u.name, t.color from assignments a
                join technicians t on t.id = a.technician_id
                join users u on u.id = t.user_id
                where a.tenant_id = :t and a.booking_id in (:ids) order by u.name
                """, p, rs -> {
            techs.computeIfAbsent(rs.getObject("booking_id", UUID.class), k -> new ArrayList<>())
                    .add(new Technician(firstName(rs.getString("name")), rs.getString("color")));
        });
        return rows.stream().map(b -> new Summary(b.id(), b.number(), b.status(), b.scheduledStart(), b.scheduledEnd(),
                b.subtotalHalalas(), b.addressText(), b.paymentMethod(), services.getOrDefault(b.id(), List.of()),
                servicesEn.getOrDefault(b.id(), List.of()), techs.getOrDefault(b.id(), List.of()))).toList();
    }

    /** Cancellation reasons and invoice numbers are fine to show; assignment notes become first names only. */
    private static String customerSafeNote(String type, String note) {
        if (note == null) {
            return null;
        }
        return switch (type) {
            case "ASSIGNED" -> String.join("، ", java.util.Arrays.stream(note.split("،")).map(String::trim)
                    .map(BookingQueries::firstName).toList());
            case "CREATED" -> note; // "booking_page" / "portal"
            default -> note;
        };
    }

    /** Customers see technicians by first name only. */
    static String firstName(String full) {
        if (full == null) {
            return null;
        }
        String t = full.trim();
        int sp = t.indexOf(' ');
        return sp > 0 ? t.substring(0, sp) : t;
    }

    private static String navigationUrl(java.math.BigDecimal lat, java.math.BigDecimal lng, String mapUrl) {
        if (lat != null && lng != null) {
            return "https://www.google.com/maps/dir/?api=1&destination=" + lat.toPlainString() + "," + lng.toPlainString();
        }
        return mapUrl != null && mapUrl.startsWith("https://") ? mapUrl : null;
    }
}
