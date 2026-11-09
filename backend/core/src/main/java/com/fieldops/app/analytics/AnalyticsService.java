package com.fieldops.app.analytics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;

import com.fieldops.app.analytics.AnalyticsDtos.CategoryRow;
import com.fieldops.app.analytics.AnalyticsDtos.Cell;
import com.fieldops.app.analytics.AnalyticsDtos.CityRow;
import com.fieldops.app.analytics.AnalyticsDtos.FinanceMonth;
import com.fieldops.app.analytics.AnalyticsDtos.FinanceSummary;
import com.fieldops.app.analytics.AnalyticsDtos.FinanceTotals;
import com.fieldops.app.analytics.AnalyticsDtos.Granularity;
import com.fieldops.app.analytics.AnalyticsDtos.HeatCell;
import com.fieldops.app.analytics.AnalyticsDtos.Kpis;
import com.fieldops.app.analytics.AnalyticsDtos.Overview;
import com.fieldops.app.analytics.AnalyticsDtos.PeriodRow;
import com.fieldops.app.analytics.AnalyticsDtos.Point;
import com.fieldops.app.analytics.AnalyticsDtos.RecordKind;
import com.fieldops.app.analytics.AnalyticsDtos.RecordPage;
import com.fieldops.app.analytics.AnalyticsDtos.RecordRow;
import com.fieldops.app.analytics.AnalyticsDtos.RegionAnalytics;
import com.fieldops.app.analytics.AnalyticsDtos.RegionRow;
import com.fieldops.app.analytics.AnalyticsDtos.Sales;
import com.fieldops.app.analytics.AnalyticsDtos.SeasonCell;
import com.fieldops.app.analytics.AnalyticsDtos.ServiceAnalytics;
import com.fieldops.app.analytics.AnalyticsDtos.ServiceRef;
import com.fieldops.app.analytics.AnalyticsDtos.ServiceRow;
import com.fieldops.app.analytics.AnalyticsDtos.StatusCount;
import com.fieldops.app.analytics.AnalyticsDtos.TimeAnalytics;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.tenant.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Business-intelligence queries for the admin dashboards: business performance, services, regions, time,
 * sales and finance. Everything is aggregated in SQL over the operational tables, read-only, with a statement
 * timeout so a heavy dashboard can never hold up bookings or invoicing. RLS limits every row to the tenant and
 * each query also filters by tenant_id explicitly.
 *
 * <p>Definitions (kept identical across every screen and export):
 * <ul>
 *   <li><b>Requests</b>: bookings, by appointment date. Pending = not yet completed, cancelled or no-show.</li>
 *   <li><b>Revenue</b>: net sales = taxable amount of non-void invoices (after discount, before VAT), by issue
 *       date. An invoice's revenue is split over its booking's services in proportion to the booked lines, and its
 *       region / city is the visit address's. Invoices without a booking count only in unfiltered totals.</li>
 *   <li><b>Collected</b>: payments by payment date.</li>
 *   <li><b>Expenses</b>: salary cost (gross pay + employer contributions, spread evenly over the salary's month)
 *       plus other expenses net of VAT, by expense date. Net profit = revenue − expenses.</li>
 * </ul>
 */
@Service
public class AnalyticsService {

    private static final Pattern PARAM = Pattern.compile("(?<![:\\w]):([a-zA-Z_]\\w*)");
    private static final String PENDING = "('NEW', 'CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS')";

    /** Invoice revenue split per booked service line, with the visit's city and region. Alias {@code v}. */
    private static final String REV = """
            v as (
              select i.id as invoice_id, i.booking_id, (i.issued_at at time zone :tz) as ts,
                     b.status, bi.service_id, a.city_id, c.region_id,
                     case when bi.addon_id is null then bi.quantity * s.cost_halalas end as item_cost,
                     case when bi.id is null then cast(i.taxable_halalas as numeric)
                          when sum(bi.total_halalas) over w = 0 then cast(i.taxable_halalas as numeric) / count(*) over w
                          else cast(i.taxable_halalas as numeric) * bi.total_halalas / sum(bi.total_halalas) over w
                     end as amount,
                     case when bi.id is null then cast(i.total_halalas as numeric)
                          when sum(bi.total_halalas) over w = 0 then cast(i.total_halalas as numeric) / count(*) over w
                          else cast(i.total_halalas as numeric) * bi.total_halalas / sum(bi.total_halalas) over w
                     end as gross
              from invoices i
              left join bookings b on b.id = i.booking_id
              left join booking_items bi on bi.booking_id = b.id
              left join services s on s.id = bi.service_id
              left join addresses a on a.id = b.address_id
              left join geo_cities c on c.id = a.city_id
              where i.tenant_id = :t and i.status <> 'VOID' and i.issued_at >= :s and i.issued_at < :e
              window w as (partition by i.id)
            )
            """;

    /** Bookings by appointment time with the visit's city and region. Alias {@code r}. */
    private static final String REQ = """
            r as (
              select b.id, b.number, b.customer_id, b.status, b.scheduled_start, (b.scheduled_start at time zone :tz) as ts,
                     b.subtotal_halalas, a.city_id, c.region_id
              from bookings b
              left join addresses a on a.id = b.address_id
              left join geo_cities c on c.id = a.city_id
              where b.tenant_id = :t and b.scheduled_start >= :s and b.scheduled_start < :e
            )
            """;

    @PersistenceContext
    private EntityManager em;

    private final TenantService tenants;

    public AnalyticsService(TenantService tenants) {
        this.tenants = tenants;
    }

    /** Tenant, time zone and whether the caller may see costs, salaries and profit. */
    private record Ctx(UUID tenant, String tz, ZoneId zone, boolean financials) {
        Instant start(LocalDate d) {
            return d.atStartOfDay(zone).toInstant();
        }

        Instant end(LocalDate d) {
            return d.plusDays(1).atStartOfDay(zone).toInstant();
        }
    }

    // =============================================================================================
    // Business performance
    // =============================================================================================

    @Transactional(readOnly = true)
    public Overview overview(AnalyticsFilter f, Granularity g) {
        Ctx c = ctx();
        AnalyticsFilter pf = f.previous();
        Granularity gran = g == null ? auto(f) : g;
        Kpis current = kpis(c, f);
        Kpis previous = pf == null ? null : kpis(c, pf);

        Map<String, Object> p = params(c, f.from(), f.to());
        List<StatusCount> statuses = new ArrayList<>();
        for (Object[] row : rows("with " + REQ + " select r.status, count(*) from r" + reqWhere(f, p, null)
                + " group by r.status order by 2 desc", p)) {
            statuses.add(new StatusCount((String) row[0], num(row[1])));
        }
        return new Overview(f.from(), f.to(), pf == null ? null : pf.from(), pf == null ? null : pf.to(), current,
                previous, f.narrowed() ? null : outstanding(c), gran, series(c, f, gran),
                pf == null ? List.of() : series(c, pf, gran), statuses, c.financials(), f.narrowed());
    }

    private Kpis kpis(Ctx c, AnalyticsFilter f) {
        Map<String, Object> p = params(c, f.from(), f.to());
        Object[] rv = one("with " + REV + """
                select coalesce(sum(v.amount), 0), coalesce(sum(v.gross), 0), count(distinct v.invoice_id),
                       count(distinct coalesce(v.booking_id, v.invoice_id))
                from v""" + revWhere(f, p), p);
        long revenue = money(rv[0]);
        long gross = money(rv[1]);
        long invoiced = num(rv[3]);

        Map<String, Object> q = params(c, f.from(), f.to());
        Object[] rq = one("with " + REQ + """
                select count(*), count(*) filter (where r.status = 'COMPLETED'),
                       count(*) filter (where r.status in """ + PENDING + """
                ), count(*) filter (where r.status = 'CANCELLED'), count(*) filter (where r.status = 'NO_SHOW'),
                       count(distinct r.customer_id)
                from r""" + reqWhere(f, q, null), q);
        long requests = num(rq[0]);
        long completed = num(rq[1]);
        long cancelled = num(rq[3]);
        long noShow = num(rq[4]);

        Long collected = f.serviceId() != null ? null : collected(c, f);
        Long salary = null;
        Long other = null;
        Long expenses = null;
        Long profit = null;
        Double margin = null;
        if (c.financials() && !f.narrowed()) {
            salary = salaryCost(c, f.from(), f.to());
            other = expenseCost(c, f.from(), f.to());
            expenses = salary + other;
            profit = revenue - expenses;
            margin = revenue == 0 ? null : round4((double) profit / revenue);
        }
        return new Kpis(revenue, gross, gross - revenue, num(rv[2]), collected, requests, completed, num(rq[2]),
                cancelled, noShow, num(rq[5]), invoiced == 0 ? 0 : Math.round((double) revenue / invoiced),
                requests == 0 ? 0 : round4((double) completed / requests),
                requests == 0 ? 0 : round4((double) (cancelled + noShow) / requests), salary, other, expenses, profit,
                margin);
    }

    private long collected(Ctx c, AnalyticsFilter f) {
        Map<String, Object> p = params(c, f.from(), f.to());
        StringBuilder w = new StringBuilder();
        if (f.regionId() != null) {
            w.append(" and gc.region_id = :region");
            p.put("region", f.regionId());
        }
        if (f.cityId() != null) {
            w.append(" and a.city_id = :city");
            p.put("city", f.cityId());
        }
        if (!f.statuses().isEmpty()) {
            w.append(" and b.status in (:st)");
            p.put("st", names(f.statuses()));
        }
        return num(single("""
                select coalesce(sum(p.amount_halalas), 0) from payments p
                join invoices i on i.id = p.invoice_id
                left join bookings b on b.id = i.booking_id
                left join addresses a on a.id = b.address_id
                left join geo_cities gc on gc.id = a.city_id
                where p.tenant_id = :t and p.paid_at >= :s and p.paid_at < :e""" + w, p));
    }

    /** Salary cost of the days in [from, to]: each month's cost spread evenly over its days. */
    private long salaryCost(Ctx c, LocalDate from, LocalDate to) {
        Map<String, Object> p = new HashMap<>();
        p.put("t", c.tenant());
        p.put("dfrom", from);
        p.put("dto", to);
        return money(single("""
                select coalesce(sum(
                         cast(r.base_halalas + r.allowances_halalas + r.overtime_halalas + r.bonus_halalas
                              + r.employer_cost_halalas as numeric)
                         * (least(cast(:dto as date), cast(r.period + interval '1 month' - interval '1 day' as date))
                            - greatest(cast(:dfrom as date), r.period) + 1)
                         / extract(day from (r.period + interval '1 month' - interval '1 day'))), 0)
                from salary_records r
                where r.tenant_id = :t and r.period <= cast(:dto as date)
                  and r.period + interval '1 month' > cast(:dfrom as date)""", p));
    }

    private long expenseCost(Ctx c, LocalDate from, LocalDate to) {
        Map<String, Object> p = new HashMap<>();
        p.put("t", c.tenant());
        p.put("dfrom", from);
        p.put("dto", to);
        return num(single("""
                select coalesce(sum(amount_halalas - vat_halalas), 0) from expenses
                where tenant_id = :t and spent_on >= :dfrom and spent_on <= :dto""", p));
    }

    private long outstanding(Ctx c) {
        Map<String, Object> p = new HashMap<>();
        p.put("t", c.tenant());
        return num(single("""
                select coalesce(sum(total_halalas - paid_halalas), 0) from invoices
                where tenant_id = :t and status in ('ISSUED', 'PARTIALLY_PAID')""", p));
    }

    // =============================================================================================
    // Time series
    // =============================================================================================

    private List<Point> series(Ctx c, AnalyticsFilter f, Granularity g) {
        String bucket = bucketSql(g);
        Map<LocalDate, long[]> buckets = new TreeMap<>();
        for (LocalDate b = bucket(f.from(), g); !b.isAfter(f.to()); b = next(b, g)) {
            buckets.put(b, new long[4]);
        }
        Map<String, Object> p = params(c, f.from(), f.to());
        for (Object[] row : rows("with " + REV + " select cast(" + bucket.replace("TS", "v.ts")
                + " as date), coalesce(sum(v.amount), 0) from v" + revWhere(f, p) + " group by 1", p)) {
            long[] v = buckets.get(date(row[0]));
            if (v != null) {
                v[0] = money(row[1]);
            }
        }
        Map<String, Object> q = params(c, f.from(), f.to());
        for (Object[] row : rows("with " + REQ + " select cast(" + bucket.replace("TS", "r.ts") + """
                 as date), count(*), count(*) filter (where r.status = 'COMPLETED'),
                       count(*) filter (where r.status in ('CANCELLED', 'NO_SHOW'))
                from r""" + reqWhere(f, q, null) + " group by 1", q)) {
            long[] v = buckets.get(date(row[0]));
            if (v != null) {
                v[1] = num(row[1]);
                v[2] = num(row[2]);
                v[3] = num(row[3]);
            }
        }
        List<Point> out = new ArrayList<>();
        buckets.forEach((b, v) -> {
            LocalDate start = b.isBefore(f.from()) ? f.from() : b;
            LocalDate end = next(b, g).minusDays(1);
            out.add(new Point(start, end.isAfter(f.to()) ? f.to() : end, v[0], v[1], v[2], v[3]));
        });
        return out;
    }

    @Transactional(readOnly = true)
    public TimeAnalytics time(AnalyticsFilter f, Granularity g) {
        Ctx c = ctx();
        Granularity gran = g == null ? auto(f) : g;
        List<Point> series = series(c, f, gran);

        Map<String, Object> p = params(c, f.from(), f.to());
        List<HeatCell> heat = new ArrayList<>();
        for (Object[] row : rows("with " + REQ + """
                select cast(extract(dow from r.ts) as integer), cast(extract(hour from r.ts) as integer), count(*)
                from r""" + reqWhere(f, p, null) + " group by 1, 2", p)) {
            heat.add(new HeatCell(((Number) row[0]).intValue(), ((Number) row[1]).intValue(), num(row[2])));
        }

        // Seasonality: the three calendar years up to the end of the range, month by month.
        int lastYear = f.to().getYear();
        Map<String, Object> sp = params(c, LocalDate.of(lastYear - 2, 1, 1), LocalDate.of(lastYear, 12, 31));
        Map<Integer, long[]> season = new TreeMap<>();
        for (int y = lastYear - 2; y <= lastYear; y++) {
            for (int m = 1; m <= 12; m++) {
                season.put(y * 100 + m, new long[2]);
            }
        }
        for (Object[] row : rows("with " + REQ + """
                select cast(extract(year from r.ts) as integer) * 100 + cast(extract(month from r.ts) as integer), count(*)
                from r""" + reqWhere(f, sp, null) + " group by 1", sp)) {
            long[] v = season.get(((Number) row[0]).intValue());
            if (v != null) {
                v[0] = num(row[1]);
            }
        }
        Map<String, Object> sv = params(c, LocalDate.of(lastYear - 2, 1, 1), LocalDate.of(lastYear, 12, 31));
        for (Object[] row : rows("with " + REV + """
                select cast(extract(year from v.ts) as integer) * 100 + cast(extract(month from v.ts) as integer),
                       coalesce(sum(v.amount), 0)
                from v""" + revWhere(f, sv) + " group by 1", sv)) {
            long[] v = season.get(((Number) row[0]).intValue());
            if (v != null) {
                v[1] = money(row[1]);
            }
        }
        List<SeasonCell> seasonal = new ArrayList<>();
        season.forEach((k, v) -> seasonal.add(new SeasonCell(k / 100, k % 100, v[0], v[1])));
        return new TimeAnalytics(gran, series, heat, seasonal);
    }

    // =============================================================================================
    // Services
    // =============================================================================================

    @Transactional(readOnly = true)
    public ServiceAnalytics services(AnalyticsFilter f) {
        return services(ctx(), f);
    }

    private ServiceAnalytics services(Ctx c, AnalyticsFilter f) {
        Map<UUID, long[]> req = new HashMap<>();
        Map<String, Object> q = params(c, f.from(), f.to());
        for (Object[] row : rows("with " + REQ + """
                select bi.service_id, count(distinct r.id), count(distinct r.id) filter (where r.status = 'COMPLETED'),
                       count(distinct r.id) filter (where r.status in ('CANCELLED', 'NO_SHOW'))
                from r join booking_items bi on bi.booking_id = r.id""" + reqWhere(f, q, "bi")
                + " group by bi.service_id", q)) {
            req.put((UUID) row[0], new long[] {num(row[1]), num(row[2]), num(row[3])});
        }

        Map<UUID, Long> revenue = new HashMap<>();
        Map<UUID, Long> itemCost = new HashMap<>();
        long total = 0;
        long unassigned = 0;
        Map<String, Object> p = params(c, f.from(), f.to());
        for (Object[] row : rows("with " + REV + """
                select v.service_id, coalesce(sum(v.amount), 0), sum(v.item_cost)
                from v""" + revWhere(f, p) + " group by v.service_id", p)) {
            long amount = money(row[1]);
            total += amount;
            if (row[0] == null) {
                unassigned += amount;
            } else {
                revenue.put((UUID) row[0], amount);
                if (row[2] != null) {
                    itemCost.put((UUID) row[0], money(row[2]));
                }
            }
        }

        Map<UUID, Long> previous = new HashMap<>();
        AnalyticsFilter pf = f.previous();
        if (pf != null) {
            Map<String, Object> pp = params(c, pf.from(), pf.to());
            for (Object[] row : rows("with " + REV + " select v.service_id, coalesce(sum(v.amount), 0) from v"
                    + revWhere(pf, pp) + " and v.service_id is not null group by v.service_id", pp)) {
                previous.put((UUID) row[0], money(row[1]));
            }
        }

        Map<UUID, Long> tagged = new HashMap<>();
        if (c.financials() && f.regionId() == null && f.cityId() == null && f.statuses().isEmpty()) {
            Map<String, Object> e = new HashMap<>();
            e.put("t", c.tenant());
            e.put("dfrom", f.from());
            e.put("dto", f.to());
            for (Object[] row : rows("""
                    select service_id, sum(amount_halalas - vat_halalas) from expenses
                    where tenant_id = :t and spent_on >= :dfrom and spent_on <= :dto and service_id is not null
                    group by service_id""", e)) {
                tagged.put((UUID) row[0], num(row[1]));
            }
        }

        Map<String, Object> sp = new HashMap<>();
        sp.put("t", c.tenant());
        Set<UUID> ids = new LinkedHashSet<>();
        ids.addAll(revenue.keySet());
        ids.addAll(req.keySet());
        if (f.serviceId() != null) {
            ids.retainAll(Set.of(f.serviceId()));
            ids.add(f.serviceId());
        }
        List<ServiceRow> out = new ArrayList<>();
        for (Object[] row : rows("select id, name, name_en, active, cost_halalas from services where tenant_id = :t", sp)) {
            UUID id = (UUID) row[0];
            if (!ids.contains(id)) {
                continue;
            }
            long[] r = req.getOrDefault(id, new long[3]);
            long rev = revenue.getOrDefault(id, 0L);
            Long unitCost = row[4] == null ? null : num(row[4]);
            Long direct = null;
            Long profit = null;
            Double margin = null;
            if (c.financials()) {
                Long items = itemCost.get(id);
                Long tag = tagged.get(id);
                if (items != null || tag != null) {
                    direct = (items == null ? 0 : items) + (tag == null ? 0 : tag);
                    profit = rev - direct;
                    margin = rev == 0 ? null : round4((double) profit / rev);
                }
            } else {
                unitCost = null;
            }
            out.add(new ServiceRow(id, (String) row[1], (String) row[2], Boolean.TRUE.equals(row[3]), r[0], r[1], r[2],
                    rev, previous.getOrDefault(id, 0L), total == 0 ? 0 : round4((double) rev / total), unitCost,
                    direct, profit, margin));
        }
        out.sort(Comparator.comparingLong(ServiceRow::revenueHalalas).reversed()
                .thenComparing(Comparator.comparingLong(ServiceRow::requests).reversed()));
        return new ServiceAnalytics(out, total, unassigned, c.financials());
    }

    // =============================================================================================
    // Regions
    // =============================================================================================

    @Transactional(readOnly = true)
    public RegionAnalytics regions(AnalyticsFilter f) {
        return regions(ctx(), f);
    }

    private RegionAnalytics regions(Ctx c, AnalyticsFilter f) {
        Map<Integer, long[]> req = new HashMap<>();
        Map<String, Object> q = params(c, f.from(), f.to());
        for (Object[] row : rows("with " + REQ + """
                select cast(r.region_id as integer), count(*), count(*) filter (where r.status = 'COMPLETED'),
                       count(*) filter (where r.status in ('CANCELLED', 'NO_SHOW'))
                from r""" + reqWhere(f, q, null) + " group by r.region_id", q)) {
            req.put(intOrNull(row[0]), new long[] {num(row[1]), num(row[2]), num(row[3])});
        }
        Map<Integer, Long> rev = new HashMap<>();
        long total = 0;
        Map<String, Object> p = params(c, f.from(), f.to());
        for (Object[] row : rows("with " + REV + " select cast(v.region_id as integer), coalesce(sum(v.amount), 0) from v"
                + revWhere(f, p) + " group by v.region_id", p)) {
            long amount = money(row[1]);
            rev.put(intOrNull(row[0]), amount);
            total += amount;
        }

        List<RegionRow> regions = new ArrayList<>();
        for (Object[] row : rows("select cast(id as integer), code, name_ar, name_en from geo_regions order by id", new HashMap<>())) {
            Integer id = intOrNull(row[0]);
            long[] r = req.getOrDefault(id, new long[3]);
            long amount = rev.getOrDefault(id, 0L);
            regions.add(new RegionRow(id, (String) row[1], (String) row[2], (String) row[3], r[0], r[1], r[2], amount,
                    total == 0 ? 0 : round4((double) amount / total)));
        }
        regions.sort(Comparator.comparingLong(RegionRow::requests).reversed()
                .thenComparing(Comparator.comparingLong(RegionRow::revenueHalalas).reversed()));

        // Cities: the 25 busiest.
        Map<Integer, long[]> cityReq = new HashMap<>();
        Map<String, Object> cq = params(c, f.from(), f.to());
        for (Object[] row : rows("with " + REQ + " select r.city_id, count(*) from r" + reqWhere(f, cq, null)
                + " and r.city_id is not null group by r.city_id", cq)) {
            cityReq.put(intOrNull(row[0]), new long[] {num(row[1]), 0});
        }
        Map<String, Object> cv = params(c, f.from(), f.to());
        for (Object[] row : rows("with " + REV + " select v.city_id, coalesce(sum(v.amount), 0) from v" + revWhere(f, cv)
                + " and v.city_id is not null group by v.city_id", cv)) {
            cityReq.computeIfAbsent(intOrNull(row[0]), k -> new long[2])[1] = money(row[1]);
        }
        List<Integer> topCities = cityReq.entrySet().stream()
                .sorted((a, b) -> a.getValue()[0] != b.getValue()[0] ? Long.compare(b.getValue()[0], a.getValue()[0])
                        : Long.compare(b.getValue()[1], a.getValue()[1]))
                .limit(25).map(Map.Entry::getKey).toList();
        List<CityRow> cities = new ArrayList<>();
        if (!topCities.isEmpty()) {
            Map<String, Object> np = new HashMap<>();
            np.put("ids", topCities);
            Map<Integer, Object[]> names = new HashMap<>();
            for (Object[] row : rows("select id, cast(region_id as integer), name_ar, name_en from geo_cities where id in (:ids)", np)) {
                names.put(intOrNull(row[0]), row);
            }
            for (Integer id : topCities) {
                Object[] n = names.get(id);
                long[] v = cityReq.get(id);
                cities.add(new CityRow(id, n == null ? null : intOrNull(n[1]), n == null ? "" : (String) n[2],
                        n == null ? "" : (String) n[3], v[0], v[1]));
            }
        }

        // Service demand per region: the six most requested services, the rest as "other" (serviceId null).
        Map<String, Object> mq = params(c, f.from(), f.to());
        List<Object[]> cells = rows("with " + REQ + """
                select cast(r.region_id as integer), bi.service_id, count(distinct r.id)
                from r join booking_items bi on bi.booking_id = r.id""" + reqWhere(f, mq, "bi") + " group by 1, 2", mq);
        Map<UUID, Long> byService = new HashMap<>();
        for (Object[] row : cells) {
            byService.merge((UUID) row[1], num(row[2]), Long::sum);
        }
        List<UUID> top = byService.entrySet().stream().sorted(Map.Entry.<UUID, Long>comparingByValue().reversed())
                .limit(6).map(Map.Entry::getKey).toList();
        Map<String, Cell> matrix = new LinkedHashMap<>();
        for (Object[] row : cells) {
            Integer region = intOrNull(row[0]);
            UUID service = top.contains((UUID) row[1]) ? (UUID) row[1] : null;
            String key = region + "|" + service;
            Cell prev = matrix.get(key);
            matrix.put(key, new Cell(region, service, num(row[2]) + (prev == null ? 0 : prev.requests())));
        }
        List<ServiceRef> topServices = new ArrayList<>();
        if (!top.isEmpty()) {
            Map<String, Object> np = new HashMap<>();
            np.put("ids", top);
            Map<UUID, ServiceRef> refs = new HashMap<>();
            for (Object[] row : rows("select id, name, name_en from services where id in (:ids)", np)) {
                refs.put((UUID) row[0], new ServiceRef((UUID) row[0], (String) row[1], (String) row[2]));
            }
            top.forEach(id -> {
                if (refs.containsKey(id)) {
                    topServices.add(refs.get(id));
                }
            });
        }
        long[] unknown = req.getOrDefault(null, new long[3]);
        return new RegionAnalytics(regions, cities, topServices, new ArrayList<>(matrix.values()), unknown[0],
                rev.getOrDefault(null, 0L));
    }

    // =============================================================================================
    // Sales
    // =============================================================================================

    /**
     * Sales for the range plus monthly (12), quarterly (8) and yearly (5) periods ending with the range's last
     * day, each compared with the same period a year earlier (cut at the same day, so a month in progress is
     * compared with the same days last year).
     */
    @Transactional(readOnly = true)
    public Sales sales(AnalyticsFilter f) {
        Ctx c = ctx();
        Kpis current = kpis(c, f);
        AnalyticsFilter pf = f.previous();
        Kpis previous = pf == null ? null : kpis(c, pf);

        LocalDate to = f.to();
        LocalDate dataFrom = LocalDate.of(to.getYear() - 5, 1, 1);
        Map<LocalDate, long[]> daily = new HashMap<>();
        Map<String, Object> p = params(c, dataFrom, to);
        for (Object[] row : rows("with " + REV + " select cast(v.ts as date), coalesce(sum(v.amount), 0), coalesce(sum(v.gross), 0) from v"
                + revWhere(f, p) + " group by 1", p)) {
            long[] d = daily.computeIfAbsent(date(row[0]), k -> new long[4]);
            d[0] = money(row[1]);
            d[1] = money(row[2]);
        }
        Map<String, Object> q = params(c, dataFrom, to);
        for (Object[] row : rows("with " + REQ + " select cast(r.ts as date), count(*), count(*) filter (where r.status = 'COMPLETED') from r"
                + reqWhere(f, q, null) + " group by 1", q)) {
            long[] d = daily.computeIfAbsent(date(row[0]), k -> new long[4]);
            d[2] = num(row[1]);
            d[3] = num(row[2]);
        }
        BiFunction<LocalDate, LocalDate, long[]> sum = (a, b) -> {
            long[] s = new long[4];
            for (LocalDate d = a; !d.isAfter(b); d = d.plusDays(1)) {
                long[] v = daily.get(d);
                if (v != null) {
                    for (int i = 0; i < 4; i++) {
                        s[i] += v[i];
                    }
                }
            }
            return s;
        };

        List<PeriodRow> months = new ArrayList<>();
        YearMonth ym = YearMonth.from(to);
        for (int i = 11; i >= 0; i--) {
            YearMonth m = ym.minusMonths(i);
            months.add(period(m.toString(), m.atDay(1), min(m.atEndOfMonth(), to), sum));
        }
        List<PeriodRow> quarters = new ArrayList<>();
        LocalDate qStart = to.withMonth(((to.getMonthValue() - 1) / 3) * 3 + 1).withDayOfMonth(1);
        for (int i = 7; i >= 0; i--) {
            LocalDate s = qStart.minusMonths(3L * i);
            quarters.add(period(s.getYear() + "-Q" + s.get(IsoFields.QUARTER_OF_YEAR), s,
                    min(s.plusMonths(3).minusDays(1), to), sum));
        }
        List<PeriodRow> years = new ArrayList<>();
        for (int i = 4; i >= 0; i--) {
            int y = to.getYear() - i;
            years.add(period(String.valueOf(y), LocalDate.of(y, 1, 1), min(LocalDate.of(y, 12, 31), to), sum));
        }
        RegionAnalytics regions = regions(c, f);
        return new Sales(f.from(), f.to(), current, previous, months, quarters, years, services(c, f),
                regions.regions(), regions.cities(), c.financials());
    }

    private static PeriodRow period(String key, LocalDate start, LocalDate end,
                                    BiFunction<LocalDate, LocalDate, long[]> sum) {
        long[] cur = sum.apply(start, end);
        long[] prev = sum.apply(start.minusYears(1), end.minusYears(1));
        return new PeriodRow(key, start, end, cur[0], cur[1], cur[2], cur[3], prev[0]);
    }

    // =============================================================================================
    // Finance (owner only: the controller checks the role)
    // =============================================================================================

    @Transactional(readOnly = true)
    public FinanceSummary finance(int year) {
        if (year < 2000 || year > 2200) {
            throw ApiException.badRequest("invalid_year", "Choose a valid year");
        }
        Ctx c = ctx();
        if (!c.financials()) {
            throw ApiException.forbidden("owner_only", "Only the owner can see financial figures");
        }
        int prevYear = year - 1;
        Map<Integer, long[]> m = new TreeMap<>(); // key yyyymm -> revenue, collected, salary, expenses
        for (int y = prevYear; y <= year; y++) {
            for (int mo = 1; mo <= 12; mo++) {
                m.put(y * 100 + mo, new long[4]);
            }
        }
        Map<String, Object> p = params(c, LocalDate.of(prevYear, 1, 1), LocalDate.of(year, 12, 31));
        p.put("dfrom", LocalDate.of(prevYear, 1, 1));
        p.put("dto", LocalDate.of(year, 12, 31));
        String ym = "cast(extract(year from X) as integer) * 100 + cast(extract(month from X) as integer)";
        for (Object[] row : rows("select " + ym.replace("X", "(issued_at at time zone :tz)") + """
                , coalesce(sum(taxable_halalas), 0) from invoices
                where tenant_id = :t and status <> 'VOID' and issued_at >= :s and issued_at < :e group by 1""", p)) {
            add(m, row[0], 0, num(row[1]));
        }
        for (Object[] row : rows("select " + ym.replace("X", "(paid_at at time zone :tz)") + """
                , coalesce(sum(amount_halalas), 0) from payments
                where tenant_id = :t and paid_at >= :s and paid_at < :e group by 1""", p)) {
            add(m, row[0], 1, num(row[1]));
        }
        for (Object[] row : rows("select " + ym.replace("X", "period") + """
                , coalesce(sum(base_halalas + allowances_halalas + overtime_halalas + bonus_halalas + employer_cost_halalas), 0)
                from salary_records where tenant_id = :t and period >= :dfrom and period <= :dto group by 1""", p)) {
            add(m, row[0], 2, num(row[1]));
        }
        Map<String, long[]> categories = new TreeMap<>();
        for (Object[] row : rows("select " + ym.replace("X", "spent_on") + """
                , category, coalesce(sum(amount_halalas - vat_halalas), 0)
                from expenses where tenant_id = :t and spent_on >= :dfrom and spent_on <= :dto group by 1, 2""", p)) {
            add(m, row[0], 3, num(row[2]));
            int key = ((Number) row[0]).intValue();
            categories.computeIfAbsent((String) row[1], k -> new long[2])[key / 100 == year ? 0 : 1] += num(row[2]);
        }

        List<FinanceMonth> months = new ArrayList<>();
        List<FinanceMonth> previous = new ArrayList<>();
        for (int mo = 1; mo <= 12; mo++) {
            months.add(month(mo, m.get(year * 100 + mo)));
            previous.add(month(mo, m.get(prevYear * 100 + mo)));
        }
        List<CategoryRow> cats = new ArrayList<>();
        categories.forEach((k, v) -> cats.add(new CategoryRow(k, v[0], v[1])));
        cats.sort(Comparator.comparingLong(CategoryRow::costHalalas).reversed());

        Map<String, Object> sp = params(c, LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
        long paid = num(single("""
                select coalesce(sum(amount_halalas), 0) from salary_payments
                where tenant_id = :t and paid_at >= :s and paid_at < :e""", sp));
        Map<String, Object> tp = new HashMap<>();
        tp.put("t", c.tenant());
        long due = num(single("""
                select coalesce(sum(net_halalas - paid_halalas), 0) from salary_records
                where tenant_id = :t and status <> 'PAID'""", tp));
        return new FinanceSummary(year, months, previous, totals(months), totals(previous), cats, paid, due,
                outstanding(c));
    }

    private static void add(Map<Integer, long[]> m, Object key, int idx, long value) {
        long[] v = m.get(((Number) key).intValue());
        if (v != null) {
            v[idx] += value;
        }
    }

    private static FinanceMonth month(int mo, long[] v) {
        return new FinanceMonth(mo, v[0], v[1], v[2], v[3], v[0] - v[2] - v[3]);
    }

    private static FinanceTotals totals(List<FinanceMonth> months) {
        long revenue = months.stream().mapToLong(FinanceMonth::revenueHalalas).sum();
        long collected = months.stream().mapToLong(FinanceMonth::collectedHalalas).sum();
        long salary = months.stream().mapToLong(FinanceMonth::salaryCostHalalas).sum();
        long expenses = months.stream().mapToLong(FinanceMonth::expensesHalalas).sum();
        long profit = revenue - salary - expenses;
        return new FinanceTotals(revenue, collected, salary, expenses, salary + expenses, profit,
                revenue == 0 ? 0 : round4((double) profit / revenue));
    }

    // =============================================================================================
    // Records behind a chart
    // =============================================================================================

    /**
     * @param dow  optional day of week (0 = Sunday) of the appointment / issue time
     * @param hour optional hour of day
     * @param en   service names in English when available
     */
    @Transactional(readOnly = true)
    public RecordPage records(AnalyticsFilter f, RecordKind kind, Integer dow, Integer hour, boolean en, int page,
                              int size) {
        Ctx c = ctx();
        int sz = Math.min(Math.max(size, 1), 5000);
        int pg = Math.max(page, 0);
        String svcName = en ? "coalesce(nullif(s.name_en, ''), s.name)" : "s.name";
        Map<String, Object> p = params(c, f.from(), f.to());
        p.put("lim", sz);
        p.put("off", pg * sz);
        List<RecordRow> items = new ArrayList<>();
        Object[] totals;
        if (kind == RecordKind.REVENUE) {
            String where = revWhere(f, p) + timeWhere("v", dow, hour, p);
            String cte = "with " + REV + ", x as (select v.invoice_id, sum(v.amount) as amount from v" + where
                    + " group by v.invoice_id) ";
            totals = one(cte + "select count(*), coalesce(sum(x.amount), 0) from x", p);
            for (Object[] row : rows(cte + "select i.id, i.number, i.issued_at, i.customer_name, "
                    + "(select string_agg(distinct " + svcName + ", ', ') from booking_items bi join services s on s.id = bi.service_id where bi.booking_id = i.booking_id), "
                    + """
                    gc.name_ar, gc.name_en, i.status, x.amount, i.booking_id, b.number
                    from x join invoices i on i.id = x.invoice_id
                    left join bookings b on b.id = i.booking_id
                    left join addresses a on a.id = b.address_id
                    left join geo_cities gc on gc.id = a.city_id
                    order by i.issued_at desc, i.number desc limit :lim offset :off""", p)) {
                items.add(new RecordRow((UUID) row[0], kind, num(row[1]), instant(row[2]), (String) row[3],
                        (String) row[4], (String) row[5], (String) row[6], (String) row[7], money(row[8]),
                        (UUID) row[9], row[10] == null ? null : num(row[10]), num(row[1])));
            }
        } else {
            String where = reqWhere(f, p, null) + timeWhere("r", dow, hour, p);
            totals = one("with " + REQ + " select count(*), coalesce(sum(r.subtotal_halalas), 0) from r" + where, p);
            for (Object[] row : rows("with " + REQ + "select r.id, r.number, r.scheduled_start, cu.name, "
                    + "(select string_agg(distinct " + svcName + ", ', ') from booking_items bi join services s on s.id = bi.service_id where bi.booking_id = r.id), "
                    + """
                    gc.name_ar, gc.name_en, r.status, r.subtotal_halalas,
                    (select max(i.number) from invoices i where i.booking_id = r.id and i.status <> 'VOID')
                    from r join customers cu on cu.id = r.customer_id
                    left join geo_cities gc on gc.id = r.city_id""" + where
                    + " order by r.scheduled_start desc limit :lim offset :off", p)) {
                items.add(new RecordRow((UUID) row[0], kind, num(row[1]), instant(row[2]), (String) row[3],
                        (String) row[4], (String) row[5], (String) row[6], (String) row[7], num(row[8]),
                        (UUID) row[0], num(row[1]), row[9] == null ? null : num(row[9])));
            }
        }
        return new RecordPage(items, pg, sz, num(totals[0]), money(totals[1]));
    }

    // =============================================================================================
    // Helpers
    // =============================================================================================

    private Ctx ctx() {
        UUID tenant = TenantContext.require();
        String tz = tenants.current().getTimezone();
        // Analytics must never hold up operational work: cap each statement of this read-only transaction.
        em.createNativeQuery("select set_config('statement_timeout', '20000', true)").getSingleResult();
        return new Ctx(tenant, tz, ZoneId.of(tz), CurrentUser.roleOrNull() == Role.OWNER);
    }

    private static Map<String, Object> params(Ctx c, LocalDate from, LocalDate to) {
        Map<String, Object> p = new HashMap<>();
        p.put("t", c.tenant());
        p.put("tz", c.tz());
        p.put("s", c.start(from));
        p.put("e", c.end(to));
        return p;
    }

    /** Filter on the revenue facts {@code v}; starts with " where". */
    private static String revWhere(AnalyticsFilter f, Map<String, Object> p) {
        StringBuilder w = new StringBuilder(" where 1 = 1");
        if (f.regionId() != null) {
            w.append(" and v.region_id = :region");
            p.put("region", f.regionId());
        }
        if (f.cityId() != null) {
            w.append(" and v.city_id = :city");
            p.put("city", f.cityId());
        }
        if (f.serviceId() != null) {
            w.append(" and v.service_id = :svc");
            p.put("svc", f.serviceId());
        }
        if (!f.statuses().isEmpty()) {
            w.append(" and v.status in (:st)");
            p.put("st", names(f.statuses()));
        }
        return w.toString();
    }

    /**
     * Filter on the booking facts {@code r}; starts with " where".
     *
     * @param items alias of a joined booking_items row to filter the service on (per-service breakdowns), or null
     *              to keep bookings that contain the service
     */
    private static String reqWhere(AnalyticsFilter f, Map<String, Object> p, String items) {
        StringBuilder w = new StringBuilder(" where 1 = 1");
        if (f.regionId() != null) {
            w.append(" and r.region_id = :region");
            p.put("region", f.regionId());
        }
        if (f.cityId() != null) {
            w.append(" and r.city_id = :city");
            p.put("city", f.cityId());
        }
        if (f.serviceId() != null) {
            w.append(items != null ? " and " + items + ".service_id = :svc"
                    : " and r.id in (select x.booking_id from booking_items x where x.service_id = :svc)");
            p.put("svc", f.serviceId());
        }
        if (!f.statuses().isEmpty()) {
            w.append(" and r.status in (:st)");
            p.put("st", names(f.statuses()));
        }
        return w.toString();
    }

    private static String timeWhere(String alias, Integer dow, Integer hour, Map<String, Object> p) {
        StringBuilder w = new StringBuilder();
        if (dow != null) {
            if (dow < 0 || dow > 6) {
                throw ApiException.badRequest("invalid_dow", "Day of week must be 0–6");
            }
            w.append(" and extract(dow from ").append(alias).append(".ts) = :dow");
            p.put("dow", dow);
        }
        if (hour != null) {
            if (hour < 0 || hour > 23) {
                throw ApiException.badRequest("invalid_hour", "Hour must be 0–23");
            }
            w.append(" and extract(hour from ").append(alias).append(".ts) = :hour");
            p.put("hour", hour);
        }
        return w.toString();
    }

    private static List<String> names(Set<BookingStatus> statuses) {
        return statuses.stream().map(Enum::name).sorted().toList();
    }

    static Granularity auto(AnalyticsFilter f) {
        long days = f.days();
        return days <= 45 ? Granularity.DAY : days <= 200 ? Granularity.WEEK : Granularity.MONTH;
    }

    /** SQL bucket of a local timestamp "TS"; weeks start on Sunday (Saudi work week). */
    private static String bucketSql(Granularity g) {
        return switch (g) {
            case DAY -> "date_trunc('day', TS)";
            case WEEK -> "(date_trunc('week', TS + interval '1 day') - interval '1 day')";
            case MONTH -> "date_trunc('month', TS)";
            case QUARTER -> "date_trunc('quarter', TS)";
            case YEAR -> "date_trunc('year', TS)";
        };
    }

    static LocalDate bucket(LocalDate d, Granularity g) {
        return switch (g) {
            case DAY -> d;
            case WEEK -> d.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY));
            case MONTH -> d.withDayOfMonth(1);
            case QUARTER -> d.withMonth(((d.getMonthValue() - 1) / 3) * 3 + 1).withDayOfMonth(1);
            case YEAR -> d.withDayOfYear(1);
        };
    }

    static LocalDate next(LocalDate b, Granularity g) {
        return switch (g) {
            case DAY -> b.plusDays(1);
            case WEEK -> b.plusWeeks(1);
            case MONTH -> b.plusMonths(1);
            case QUARTER -> b.plusMonths(3);
            case YEAR -> b.plusYears(1);
        };
    }

    private static LocalDate min(LocalDate a, LocalDate b) {
        return a.isBefore(b) ? a : b;
    }

    @SuppressWarnings("unchecked")
    private List<Object[]> rows(String sql, Map<String, Object> params) {
        return bind(em.createNativeQuery(sql), sql, params).getResultList();
    }

    private Object[] one(String sql, Map<String, Object> params) {
        return rows(sql, params).get(0);
    }

    private Object single(String sql, Map<String, Object> params) {
        return bind(em.createNativeQuery(sql), sql, params).getSingleResult();
    }

    /** Binds exactly the parameters the statement uses (optional filters add their own). */
    private static Query bind(Query q, String sql, Map<String, Object> params) {
        Set<String> used = new HashSet<>();
        Matcher m = PARAM.matcher(sql);
        while (m.find()) {
            used.add(m.group(1));
        }
        for (String name : used) {
            if (!params.containsKey(name)) {
                throw new IllegalStateException("Missing SQL parameter :" + name);
            }
            q.setParameter(name, params.get(name));
        }
        return q;
    }

    static long num(Object o) {
        if (o == null) {
            return 0;
        }
        if (o instanceof BigDecimal bd) {
            return bd.setScale(0, RoundingMode.HALF_UP).longValue();
        }
        return ((Number) o).longValue();
    }

    /** Numeric sums of allocated amounts, rounded half-up to the halala. */
    static long money(Object o) {
        if (o == null) {
            return 0;
        }
        if (o instanceof BigDecimal bd) {
            return bd.setScale(0, RoundingMode.HALF_UP).longValue();
        }
        if (o instanceof Double d) {
            return Math.round(d);
        }
        return ((Number) o).longValue();
    }

    private static Integer intOrNull(Object o) {
        return o == null ? null : ((Number) o).intValue();
    }

    private static double round4(double v) {
        return Math.round(v * 10_000) / 10_000.0;
    }

    private static LocalDate date(Object o) {
        if (o instanceof LocalDate d) {
            return d;
        }
        if (o instanceof java.sql.Date d) {
            return d.toLocalDate();
        }
        if (o instanceof Timestamp ts) {
            return ts.toLocalDateTime().toLocalDate();
        }
        return LocalDate.parse(o.toString().substring(0, 10));
    }

    private static Instant instant(Object o) {
        if (o instanceof Instant i) {
            return i;
        }
        if (o instanceof OffsetDateTime odt) {
            return odt.toInstant();
        }
        if (o instanceof Timestamp ts) {
            return ts.toInstant();
        }
        return Instant.parse(o.toString());
    }
}
