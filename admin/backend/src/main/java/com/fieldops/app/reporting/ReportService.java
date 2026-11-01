package com.fieldops.app.reporting;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.tenant.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Owner reports for a date range (inclusive, in the company's time zone). Aggregations run in SQL; RLS
 * restricts every table to the tenant and each query also filters by tenant_id explicitly.
 *
 * <p>Bookings are counted by scheduled date, invoices by issue date, payments by payment date.
 */
@Service
public class ReportService {

    public static final int MAX_DAYS = 366;

    @PersistenceContext
    private EntityManager em;

    private final TenantService tenants;

    public ReportService(TenantService tenants) {
        this.tenants = tenants;
    }

    public record Summary(LocalDate from, LocalDate to, Bookings bookings, Revenue revenue, Customers customers,
                          List<Day> daily, List<ServiceRow> topServices, List<TechnicianRow> technicians) {
    }

    public record Bookings(long total, long completed, long cancelled, long noShow, long open, long fromBookingPage,
                           Map<String, Long> byStatus, long completedValueHalalas) {
    }

    public record Revenue(long invoicedHalalas, long vatHalalas, long invoiceCount, long collectedHalalas,
                          long outstandingHalalas, long averageTicketHalalas) {
    }

    public record Customers(long newCustomers, long active, long returning) {
    }

    public record Day(LocalDate date, long bookings, long completed, long invoicedHalalas, long collectedHalalas) {
    }

    public record ServiceRow(UUID serviceId, String name, long bookings, long revenueHalalas) {
    }

    public record TechnicianRow(UUID technicianId, String name, String color, long visits, long completed, long noShow,
                                double hours, long completedValueHalalas) {
    }

    @Transactional(readOnly = true)
    public Summary summary(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw ApiException.badRequest("invalid_range", "Choose a valid date range");
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_DAYS) {
            throw ApiException.badRequest("invalid_range", "The range can be at most one year");
        }
        UUID tenant = TenantContext.require();
        String tz = tenants.current().getTimezone();
        ZoneId zone = ZoneId.of(tz);
        Instant start = from.atStartOfDay(zone).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(zone).toInstant();

        // Bookings by status
        Map<String, Long> byStatus = new LinkedHashMap<>();
        long completedValue = 0;
        for (Object[] r : rows("""
                select status, count(*), coalesce(sum(subtotal_halalas), 0)
                from bookings where tenant_id = :t and scheduled_start >= :s and scheduled_start < :e
                group by status""", tenant, start, end)) {
            byStatus.put((String) r[0], num(r[1]));
            if ("COMPLETED".equals(r[0])) {
                completedValue = num(r[2]);
            }
        }
        long total = byStatus.values().stream().mapToLong(Long::longValue).sum();
        long completed = byStatus.getOrDefault("COMPLETED", 0L);
        long cancelled = byStatus.getOrDefault("CANCELLED", 0L);
        long noShow = byStatus.getOrDefault("NO_SHOW", 0L);
        long fromPage = single("""
                select count(*) from bookings
                where tenant_id = :t and scheduled_start >= :s and scheduled_start < :e and source = 'PUBLIC_PAGE'""",
                tenant, start, end);
        Bookings bookings = new Bookings(total, completed, cancelled, noShow, total - completed - cancelled - noShow,
                fromPage, byStatus, completedValue);

        // Revenue
        Object[] inv = rows("""
                select coalesce(sum(total_halalas), 0), coalesce(sum(vat_halalas), 0), count(*)
                from invoices where tenant_id = :t and issued_at >= :s and issued_at < :e and status <> 'VOID'""",
                tenant, start, end).get(0);
        long collected = single("""
                select coalesce(sum(amount_halalas), 0) from payments
                where tenant_id = :t and paid_at >= :s and paid_at < :e""", tenant, start, end);
        Query outstandingQ = em.createNativeQuery("""
                select coalesce(sum(total_halalas - paid_halalas), 0) from invoices
                where tenant_id = :t and status in ('ISSUED', 'PARTIALLY_PAID')""");
        outstandingQ.setParameter("t", tenant);
        long outstanding = num(outstandingQ.getSingleResult());
        long invoiced = num(inv[0]);
        long invoiceCount = num(inv[2]);
        Revenue revenue = new Revenue(invoiced, num(inv[1]), invoiceCount, collected, outstanding,
                invoiceCount == 0 ? 0 : Math.round((double) invoiced / invoiceCount));

        // Customers
        long newCustomers = single("""
                select count(*) from customers where tenant_id = :t and created_at >= :s and created_at < :e""",
                tenant, start, end);
        long active = single("""
                select count(distinct customer_id) from bookings
                where tenant_id = :t and scheduled_start >= :s and scheduled_start < :e
                  and status not in ('CANCELLED')""", tenant, start, end);
        long returning = single("""
                select count(distinct b.customer_id) from bookings b
                where b.tenant_id = :t and b.scheduled_start >= :s and b.scheduled_start < :e and b.status <> 'CANCELLED'
                  and exists (select 1 from bookings p where p.tenant_id = :t and p.customer_id = b.customer_id
                              and p.status = 'COMPLETED' and p.scheduled_start < :s)""", tenant, start, end);
        Customers customers = new Customers(newCustomers, active, returning);

        // Daily series (every day in the range, zero-filled)
        Map<LocalDate, long[]> days = new TreeMap<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            days.put(d, new long[4]);
        }
        for (Object[] r : rowsTz("""
                select cast(scheduled_start at time zone :tz as date), count(*),
                       count(*) filter (where status = 'COMPLETED')
                from bookings where tenant_id = :t and scheduled_start >= :s and scheduled_start < :e
                group by 1""", tenant, start, end, tz)) {
            long[] v = days.get(date(r[0]));
            if (v != null) {
                v[0] = num(r[1]);
                v[1] = num(r[2]);
            }
        }
        for (Object[] r : rowsTz("""
                select cast(issued_at at time zone :tz as date), coalesce(sum(total_halalas), 0)
                from invoices where tenant_id = :t and issued_at >= :s and issued_at < :e and status <> 'VOID'
                group by 1""", tenant, start, end, tz)) {
            long[] v = days.get(date(r[0]));
            if (v != null) {
                v[2] = num(r[1]);
            }
        }
        for (Object[] r : rowsTz("""
                select cast(paid_at at time zone :tz as date), coalesce(sum(amount_halalas), 0)
                from payments where tenant_id = :t and paid_at >= :s and paid_at < :e
                group by 1""", tenant, start, end, tz)) {
            long[] v = days.get(date(r[0]));
            if (v != null) {
                v[3] = num(r[1]);
            }
        }
        List<Day> daily = new ArrayList<>();
        days.forEach((d, v) -> daily.add(new Day(d, v[0], v[1], v[2], v[3])));

        // Top services (completed visits, add-ons count toward their service)
        List<ServiceRow> services = new ArrayList<>();
        for (Object[] r : rows("""
                select bi.service_id, max(s.name), count(distinct b.id), coalesce(sum(bi.total_halalas), 0)
                from booking_items bi
                join bookings b on b.id = bi.booking_id
                join services s on s.id = bi.service_id
                where b.tenant_id = :t and b.status = 'COMPLETED' and b.scheduled_start >= :s and b.scheduled_start < :e
                group by bi.service_id
                order by 4 desc, 3 desc
                limit 8""", tenant, start, end)) {
            services.add(new ServiceRow((UUID) r[0], (String) r[1], num(r[2]), num(r[3])));
        }

        // Technicians
        List<TechnicianRow> techs = new ArrayList<>();
        for (Object[] r : rows("""
                select t.id, u.name, t.color,
                       count(distinct a.booking_id),
                       count(distinct a.booking_id) filter (where b.status = 'COMPLETED'),
                       count(distinct a.booking_id) filter (where b.status = 'NO_SHOW'),
                       coalesce(sum(extract(epoch from (a.ends_at - a.starts_at)) / 3600.0)
                                filter (where b.status = 'COMPLETED'), 0),
                       coalesce(sum(b.subtotal_halalas) filter (where b.status = 'COMPLETED'), 0)
                from assignments a
                join bookings b on b.id = a.booking_id
                join technicians t on t.id = a.technician_id
                join users u on u.id = t.user_id
                where a.tenant_id = :t and b.scheduled_start >= :s and b.scheduled_start < :e
                group by t.id, u.name, t.color
                order by 5 desc, 4 desc""", tenant, start, end)) {
            techs.add(new TechnicianRow((UUID) r[0], (String) r[1], (String) r[2], num(r[3]), num(r[4]), num(r[5]),
                    Math.round(((Number) r[6]).doubleValue() * 10) / 10.0, num(r[7])));
        }

        return new Summary(from, to, bookings, revenue, customers, daily, services, techs);
    }

    // ---------------------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private List<Object[]> rows(String sql, UUID tenant, Instant start, Instant end) {
        return em.createNativeQuery(sql)
                .setParameter("t", tenant)
                .setParameter("s", start)
                .setParameter("e", end)
                .getResultList();
    }

    @SuppressWarnings("unchecked")
    private List<Object[]> rowsTz(String sql, UUID tenant, Instant start, Instant end, String tz) {
        return em.createNativeQuery(sql)
                .setParameter("t", tenant)
                .setParameter("s", start)
                .setParameter("e", end)
                .setParameter("tz", tz)
                .getResultList();
    }

    private long single(String sql, UUID tenant, Instant start, Instant end) {
        return num(em.createNativeQuery(sql)
                .setParameter("t", tenant)
                .setParameter("s", start)
                .setParameter("e", end)
                .getSingleResult());
    }

    private static long num(Object o) {
        if (o == null) {
            return 0;
        }
        if (o instanceof BigDecimal bd) {
            return bd.longValue();
        }
        return ((Number) o).longValue();
    }

    private static LocalDate date(Object o) {
        if (o instanceof LocalDate d) {
            return d;
        }
        if (o instanceof java.sql.Date d) {
            return d.toLocalDate();
        }
        return LocalDate.parse(o.toString());
    }
}
