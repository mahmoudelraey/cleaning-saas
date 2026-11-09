package com.fieldops.app.analytics.export;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import com.fieldops.app.analytics.AnalyticsDtos.CityRow;
import com.fieldops.app.analytics.AnalyticsDtos.HeatCell;
import com.fieldops.app.analytics.AnalyticsDtos.Kpis;
import com.fieldops.app.analytics.AnalyticsDtos.Overview;
import com.fieldops.app.analytics.AnalyticsDtos.Point;
import com.fieldops.app.analytics.AnalyticsDtos.RecordKind;
import com.fieldops.app.analytics.AnalyticsDtos.RecordPage;
import com.fieldops.app.analytics.AnalyticsDtos.RecordRow;
import com.fieldops.app.analytics.AnalyticsDtos.RegionAnalytics;
import com.fieldops.app.analytics.AnalyticsDtos.RegionRow;
import com.fieldops.app.analytics.AnalyticsDtos.SeasonCell;
import com.fieldops.app.analytics.AnalyticsDtos.ServiceAnalytics;
import com.fieldops.app.analytics.AnalyticsDtos.ServiceRow;
import com.fieldops.app.analytics.AnalyticsDtos.StatusCount;
import com.fieldops.app.analytics.AnalyticsDtos.TimeAnalytics;
import com.fieldops.app.analytics.AnalyticsFilter;
import com.fieldops.app.analytics.AnalyticsService;
import com.fieldops.app.analytics.export.ReportBook.Table;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.tenant.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.fieldops.app.analytics.export.ReportBook.money;
import static com.fieldops.app.analytics.export.ReportBook.pct;

/**
 * Builds the comprehensive report (Excel or PDF) for a period from the same queries as the dashboards: KPIs with
 * the comparison period, trend, services, regions and cities, statuses, peak times, seasonality, finance (owner
 * only) and, in Excel, the underlying bookings and invoices.
 */
@Service
public class AnalyticsExportService {

    /** Rows of each record list in the Excel file. */
    private static final int RECORD_LIMIT = 5000;

    @PersistenceContext
    private EntityManager em;

    private final AnalyticsService analytics;
    private final TenantService tenants;
    private final ReportPdfRenderer pdf;

    public AnalyticsExportService(AnalyticsService analytics, TenantService tenants, ReportPdfRenderer pdf) {
        this.analytics = analytics;
        this.tenants = tenants;
        this.pdf = pdf;
    }

    public enum Format {
        XLSX, PDF
    }

    public record Export(byte[] content, String filename, String contentType) {
    }

    @Transactional(readOnly = true)
    public Export export(AnalyticsFilter f, Format format, String lang) {
        boolean ar = !"en".equalsIgnoreCase(lang);
        L l = new L(ar);
        Overview o = analytics.overview(f, null);
        ServiceAnalytics s = analytics.services(f);
        RegionAnalytics r = analytics.regions(f);
        TimeAnalytics t = analytics.time(f, null);

        List<Table> tables = new ArrayList<>();
        tables.add(kpis(l, o));
        tables.add(trend(l, o));
        tables.add(statuses(l, o));
        tables.add(services(l, s));
        tables.add(regions(l, r));
        tables.add(cities(l, r));
        tables.add(peaks(l, t));
        tables.add(seasonal(l, t));
        if (o.financials() && !o.narrowed()) {
            tables.add(expenses(l, f));
        }
        if (format == Format.XLSX) {
            tables.add(records(l, analytics.records(f, RecordKind.REQUESTS, null, null, !ar, 0, RECORD_LIMIT), true));
            tables.add(records(l, analytics.records(f, RecordKind.REVENUE, null, null, !ar, 0, RECORD_LIMIT), false));
        }

        String company = tenants.current().getName();
        ReportBook book = new ReportBook(l.t("title") + " — " + company, subtitle(l, f, o), ar, tables);
        String base = "fieldops-report-" + f.from() + "_" + f.to();
        return format == Format.PDF
                ? new Export(pdf.render(book), base + ".pdf", "application/pdf")
                : new Export(XlsxWriter.write(book), base + ".xlsx",
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }

    // ---------------------------------------------------------------------------------------------

    private Table kpis(L l, Overview o) {
        Kpis c = o.current();
        Kpis p = o.previous();
        List<List<Object>> rows = new ArrayList<>();
        kpi(rows, l.t("revenue"), money(c.revenueHalalas()), p == null ? null : p.revenueHalalas(), c.revenueHalalas(), true);
        kpi(rows, l.t("grossSales"), money(c.grossSalesHalalas()), p == null ? null : p.grossSalesHalalas(), c.grossSalesHalalas(), true);
        kpi(rows, l.t("vat"), money(c.vatHalalas()), p == null ? null : p.vatHalalas(), c.vatHalalas(), true);
        if (c.collectedHalalas() != null) {
            kpi(rows, l.t("collected"), money(c.collectedHalalas()), p == null ? null : p.collectedHalalas(), c.collectedHalalas(), true);
        }
        if (o.outstandingHalalas() != null) {
            rows.add(row(l.t("outstanding"), money(o.outstandingHalalas()), null, null));
        }
        if (c.expensesHalalas() != null) {
            kpi(rows, l.t("salaryCost"), money(c.salaryCostHalalas()), p == null ? null : p.salaryCostHalalas(), c.salaryCostHalalas(), true);
            kpi(rows, l.t("otherExpenses"), money(c.otherExpensesHalalas()), p == null ? null : p.otherExpensesHalalas(), c.otherExpensesHalalas(), true);
            kpi(rows, l.t("expenses"), money(c.expensesHalalas()), p == null ? null : p.expensesHalalas(), c.expensesHalalas(), true);
            kpi(rows, l.t("netProfit"), money(c.netProfitHalalas()), p == null ? null : p.netProfitHalalas(), c.netProfitHalalas(), true);
            rows.add(row(l.t("profitMargin"), pct(c.profitMargin()), p == null ? null : pct(p.profitMargin()), null));
        }
        kpi(rows, l.t("requests"), c.requests(), p == null ? null : p.requests(), c.requests(), false);
        kpi(rows, l.t("completed"), c.completed(), p == null ? null : p.completed(), c.completed(), false);
        kpi(rows, l.t("pending"), c.pending(), p == null ? null : p.pending(), c.pending(), false);
        kpi(rows, l.t("cancelled"), c.cancelled(), p == null ? null : p.cancelled(), c.cancelled(), false);
        kpi(rows, l.t("noShow"), c.noShow(), p == null ? null : p.noShow(), c.noShow(), false);
        kpi(rows, l.t("invoices"), c.invoices(), p == null ? null : p.invoices(), c.invoices(), false);
        kpi(rows, l.t("customers"), c.customers(), p == null ? null : p.customers(), c.customers(), false);
        kpi(rows, l.t("avgRevenue"), money(c.avgRevenuePerRequestHalalas()), p == null ? null : p.avgRevenuePerRequestHalalas(), c.avgRevenuePerRequestHalalas(), true);
        rows.add(row(l.t("completionRate"), pct(c.completionRate()), p == null ? null : pct(p.completionRate()), null));
        rows.add(row(l.t("cancellationRate"), pct(c.cancellationRate()), p == null ? null : pct(p.cancellationRate()), null));
        String prevHeader = o.previousFrom() == null ? l.t("previous") : l.t("previous") + " (" + o.previousFrom() + " – " + o.previousTo() + ")";
        return new Table(l.t("sheetSummary"), l.t("sheetSummary"),
                List.of(l.t("indicator"), l.t("current"), prevHeader, l.t("change")), List.of(34, 18, 24, 12), rows, true);
    }

    private static void kpi(List<List<Object>> rows, String label, Object current, Long previous, long currentRaw, boolean isMoney) {
        Object prev = previous == null ? null : isMoney ? money(previous) : (Object) previous;
        rows.add(row(label, current, prev, previous == null ? null : pct(growth(currentRaw, previous))));
    }

    private static Double growth(long current, long previous) {
        return previous == 0 ? null : (double) (current - previous) / Math.abs(previous);
    }

    private Table trend(L l, Overview o) {
        List<List<Object>> rows = new ArrayList<>();
        for (Point p : o.trend()) {
            rows.add(row(p.start().toString(), p.end().toString(), money(p.revenueHalalas()), p.requests(), p.completed(), p.cancelled()));
        }
        return new Table(l.t("sheetTrend"), l.t("sheetTrend") + " (" + l.t("gran." + o.granularity()) + ")",
                List.of(l.t("from"), l.t("to"), l.t("revenue"), l.t("requests"), l.t("completed"), l.t("cancelledNoShow")),
                List.of(14, 14, 18, 12, 12, 16), rows, true);
    }

    private Table statuses(L l, Overview o) {
        long total = o.statuses().stream().mapToLong(StatusCount::count).sum();
        List<List<Object>> rows = new ArrayList<>();
        for (StatusCount s : o.statuses()) {
            rows.add(row(l.t("status." + s.status()), s.count(), pct(total == 0 ? 0.0 : (double) s.count() / total)));
        }
        return new Table(l.t("sheetStatuses"), l.t("sheetStatuses"), List.of(l.t("status"), l.t("requests"), l.t("share")),
                List.of(24, 12, 12), rows, true);
    }

    private Table services(L l, ServiceAnalytics s) {
        boolean fin = s.financials();
        List<String> headers = new ArrayList<>(List.of(l.t("service"), l.t("requests"), l.t("completed"),
                l.t("cancelledNoShow"), l.t("revenue"), l.t("share"), l.t("previousRevenue"), l.t("change")));
        List<Integer> widths = new ArrayList<>(List.of(28, 11, 11, 13, 16, 10, 16, 10));
        if (fin) {
            headers.addAll(List.of(l.t("directCost"), l.t("grossProfit"), l.t("margin")));
            widths.addAll(List.of(15, 15, 10));
        }
        List<List<Object>> rows = new ArrayList<>();
        for (ServiceRow r : s.services()) {
            List<Object> row = new ArrayList<>(List.of(l.name(r.name(), r.nameEn())));
            row.add(r.requests());
            row.add(r.completed());
            row.add(r.cancelled());
            row.add(money(r.revenueHalalas()));
            row.add(pct(r.share()));
            row.add(money(r.previousRevenueHalalas()));
            row.add(pct(growth(r.revenueHalalas(), r.previousRevenueHalalas())));
            if (fin) {
                row.add(money(r.directCostHalalas()));
                row.add(money(r.profitHalalas()));
                row.add(pct(r.margin()));
            }
            rows.add(row);
        }
        if (s.unassignedRevenueHalalas() > 0) {
            rows.add(row(l.t("unassigned"), null, null, null, money(s.unassignedRevenueHalalas()),
                    pct(s.revenueHalalas() == 0 ? 0.0 : (double) s.unassignedRevenueHalalas() / s.revenueHalalas())));
        }
        return new Table(l.t("sheetServices"), l.t("sheetServices"), headers, widths, rows, true);
    }

    private Table regions(L l, RegionAnalytics r) {
        List<List<Object>> rows = new ArrayList<>();
        for (RegionRow x : r.regions()) {
            if (x.requests() == 0 && x.revenueHalalas() == 0) {
                continue;
            }
            rows.add(row(l.name(x.nameAr(), x.nameEn()), x.requests(), x.completed(), x.cancelled(),
                    money(x.revenueHalalas()), pct(x.share())));
        }
        if (r.unknownRequests() > 0 || r.unknownRevenueHalalas() > 0) {
            rows.add(row(l.t("unknownLocation"), r.unknownRequests(), null, null, money(r.unknownRevenueHalalas()), null));
        }
        return new Table(l.t("sheetRegions"), l.t("sheetRegions"),
                List.of(l.t("region"), l.t("requests"), l.t("completed"), l.t("cancelledNoShow"), l.t("revenue"), l.t("share")),
                List.of(28, 12, 12, 14, 18, 10), rows, true);
    }

    private Table cities(L l, RegionAnalytics r) {
        Map<Integer, RegionRow> regions = r.regions().stream().filter(x -> x.regionId() != null)
                .collect(Collectors.toMap(RegionRow::regionId, x -> x));
        List<List<Object>> rows = new ArrayList<>();
        for (CityRow c : r.cities()) {
            RegionRow reg = c.regionId() == null ? null : regions.get(c.regionId());
            rows.add(row(l.name(c.nameAr(), c.nameEn()), reg == null ? "" : l.name(reg.nameAr(), reg.nameEn()),
                    c.requests(), money(c.revenueHalalas())));
        }
        return new Table(l.t("sheetCities"), l.t("sheetCities"),
                List.of(l.t("city"), l.t("region"), l.t("requests"), l.t("revenue")), List.of(24, 26, 12, 18), rows, true);
    }

    private Table peaks(L l, TimeAnalytics t) {
        List<List<Object>> rows = new ArrayList<>();
        t.heatmap().stream().sorted(Comparator.comparingLong(HeatCell::requests).reversed()).limit(15)
                .forEach(h -> rows.add(row(l.t("dow." + h.dow()), hour(l, h.hour()), h.requests())));
        return new Table(l.t("sheetPeaks"), l.t("sheetPeaks"), List.of(l.t("day"), l.t("hour"), l.t("requests")),
                List.of(16, 16, 12), rows, true);
    }

    private Table seasonal(L l, TimeAnalytics t) {
        List<List<Object>> rows = new ArrayList<>();
        for (SeasonCell s : t.seasonal()) {
            rows.add(row(s.year() + "-" + String.format("%02d", s.month()), s.requests(), money(s.revenueHalalas())));
        }
        return new Table(l.t("sheetSeasonal"), l.t("sheetSeasonal"), List.of(l.t("month"), l.t("requests"), l.t("revenue")),
                List.of(14, 12, 18), rows, true);
    }

    private Table expenses(L l, AnalyticsFilter f) {
        @SuppressWarnings("unchecked")
        List<Object[]> data = em.createNativeQuery("""
                        select category, coalesce(sum(amount_halalas - vat_halalas), 0), count(*) from expenses
                        where tenant_id = :t and spent_on >= :f and spent_on <= :to group by category order by 2 desc""")
                .setParameter("t", TenantContext.require())
                .setParameter("f", f.from())
                .setParameter("to", f.to())
                .getResultList();
        List<List<Object>> rows = new ArrayList<>();
        for (Object[] r : data) {
            rows.add(row(l.t("cat." + r[0]), money(((Number) r[1]).longValue()), ((Number) r[2]).longValue()));
        }
        return new Table(l.t("sheetExpenses"), l.t("sheetExpenses") + " · " + l.t("salariesSeparate"),
                List.of(l.t("category"), l.t("cost"), l.t("entries")), List.of(26, 18, 12), rows, true);
    }

    private Table records(L l, RecordPage page, boolean requests) {
        ZoneId zone = ZoneId.of(tenants.current().getTimezone());
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd hh:mm a").withZone(zone);
        List<List<Object>> rows = new ArrayList<>();
        for (RecordRow r : page.items()) {
            rows.add(row(r.number(), fmt.format(r.date()), r.customerName(), r.services() == null ? "" : r.services(),
                    l.name(r.cityAr(), r.cityEn()), requests ? l.t("status." + r.status()) : l.t("inv." + r.status()),
                    money(r.amountHalalas()), requests ? r.invoiceNumber() : r.bookingNumber()));
        }
        String title = l.t(requests ? "sheetRequests" : "sheetInvoices");
        if (page.total() > page.items().size()) {
            title += " (" + page.items().size() + " / " + page.total() + ")";
        }
        return new Table(l.t(requests ? "sheetRequests" : "sheetInvoices"), title,
                List.of(l.t("number"), l.t("date"), l.t("customer"), l.t("service"), l.t("city"), l.t("status"),
                        l.t(requests ? "bookingValue" : "revenue"), l.t(requests ? "invoiceNo" : "bookingNo")),
                List.of(10, 20, 24, 30, 16, 16, 16, 12), rows, false);
    }

    private String subtitle(L l, AnalyticsFilter f, Overview o) {
        StringBuilder s = new StringBuilder(l.t("period")).append(": ").append(f.from()).append(" – ").append(f.to());
        if (f.regionId() != null) {
            s.append(" · ").append(l.t("region")).append(": ").append(name("geo_regions", f.regionId(), l));
        }
        if (f.cityId() != null) {
            s.append(" · ").append(l.t("city")).append(": ").append(name("geo_cities", f.cityId(), l));
        }
        if (f.serviceId() != null) {
            s.append(" · ").append(l.t("service")).append(": ").append(serviceName(f.serviceId(), l));
        }
        if (!f.statuses().isEmpty()) {
            s.append(" · ").append(l.t("status")).append(": ")
                    .append(f.statuses().stream().map(x -> l.t("status." + x.name())).sorted().collect(Collectors.joining("، ")));
        }
        if (o.previousFrom() != null) {
            s.append(" · ").append(l.t("comparedWith")).append(" ").append(o.previousFrom()).append(" – ").append(o.previousTo());
        }
        s.append(" · ").append(l.t("basis"));
        s.append(" · ").append(l.t("generated")).append(" ").append(LocalDate.now(ZoneId.of(tenants.current().getTimezone())));
        return s.toString();
    }

    private String name(String table, Integer id, L l) {
        // table is one of two constants above, never user input.
        Object[] r = (Object[]) em.createNativeQuery("select name_ar, name_en from " + table + " where id = :id")
                .setParameter("id", id).getResultStream().findFirst().orElse(null);
        return r == null ? String.valueOf(id) : l.name((String) r[0], (String) r[1]);
    }

    private String serviceName(UUID id, L l) {
        Object[] r = (Object[]) em.createNativeQuery("select name, name_en from services where id = :id")
                .setParameter("id", id).getResultStream().findFirst().orElse(null);
        return r == null ? "" : l.name((String) r[0], (String) r[1]);
    }

    private static String hour(L l, int h) {
        int h12 = h % 12 == 0 ? 12 : h % 12;
        return String.format("%d:00 %s", h12, h < 12 ? l.t("am") : l.t("pm"));
    }

    private static List<Object> row(Object... values) {
        List<Object> out = new ArrayList<>(values.length);
        for (Object v : values) {
            out.add(v);
        }
        return out;
    }

    /** Arabic / English labels of the export. */
    private record L(boolean ar) {
        private static final Map<String, String[]> T = new HashMap<>();

        static {
            put("title", "تقرير أداء الأعمال", "Business performance report");
            put("period", "الفترة", "Period");
            put("comparedWith", "مقارنةً بـ", "compared with");
            put("generated", "أُنشئ في", "generated");
            put("basis", "الطلبات حسب تاريخ الموعد، الإيرادات حسب تاريخ الفاتورة (بدون الضريبة)",
                    "requests by appointment date, revenue by invoice date (excl. VAT)");
            put("sheetSummary", "الملخص", "Summary");
            put("sheetTrend", "الاتجاه الزمني", "Trend");
            put("sheetStatuses", "حالات الطلبات", "Request statuses");
            put("sheetServices", "الخدمات", "Services");
            put("sheetRegions", "المناطق", "Regions");
            put("sheetCities", "المدن", "Cities");
            put("sheetPeaks", "أوقات الذروة", "Peak times");
            put("sheetSeasonal", "الموسمية", "Seasonality");
            put("sheetExpenses", "المصروفات حسب الفئة", "Expenses by category");
            put("sheetRequests", "الطلبات", "Requests");
            put("sheetInvoices", "الفواتير", "Invoices");
            put("salariesSeparate", "الرواتب محسوبة في الملخص", "salaries are in the summary");
            put("indicator", "المؤشر", "Indicator");
            put("current", "الفترة الحالية", "Current period");
            put("previous", "فترة المقارنة", "Comparison period");
            put("change", "التغير", "Change");
            put("revenue", "الإيراد (بدون الضريبة)", "Revenue (excl. VAT)");
            put("grossSales", "إجمالي المبيعات (شامل الضريبة)", "Gross sales (incl. VAT)");
            put("vat", "ضريبة القيمة المضافة", "VAT");
            put("collected", "المحصّل", "Collected");
            put("outstanding", "مستحقات غير محصّلة (كل الفترات)", "Outstanding (all time)");
            put("salaryCost", "تكلفة الرواتب", "Salary cost");
            put("otherExpenses", "المصروفات الأخرى", "Other expenses");
            put("expenses", "إجمالي المصروفات", "Total expenses");
            put("netProfit", "صافي الربح", "Net profit");
            put("profitMargin", "هامش الربح", "Profit margin");
            put("requests", "الطلبات", "Requests");
            put("completed", "مكتملة", "Completed");
            put("pending", "قيد التنفيذ", "Pending");
            put("cancelled", "ملغاة", "Cancelled");
            put("noShow", "لم يحضر العميل", "No-show");
            put("cancelledNoShow", "ملغاة / لم يحضر", "Cancelled / no-show");
            put("invoices", "الفواتير", "Invoices");
            put("customers", "العملاء", "Customers");
            put("avgRevenue", "متوسط الإيراد لكل طلب", "Avg. revenue per request");
            put("completionRate", "نسبة الإنجاز", "Completion rate");
            put("cancellationRate", "نسبة الإلغاء", "Cancellation rate");
            put("from", "من", "From");
            put("to", "إلى", "To");
            put("status", "الحالة", "Status");
            put("share", "الحصة", "Share");
            put("service", "الخدمة", "Service");
            put("previousRevenue", "إيراد فترة المقارنة", "Comparison revenue");
            put("directCost", "التكلفة المباشرة", "Direct cost");
            put("grossProfit", "الربح الإجمالي", "Gross profit");
            put("margin", "الهامش", "Margin");
            put("unassigned", "فواتير بدون طلب", "Invoices without a booking");
            put("region", "المنطقة", "Region");
            put("city", "المدينة", "City");
            put("unknownLocation", "عنوان بدون مدينة", "Address without a city");
            put("day", "اليوم", "Day");
            put("hour", "الساعة", "Hour");
            put("month", "الشهر", "Month");
            put("category", "الفئة", "Category");
            put("cost", "التكلفة (بدون الضريبة)", "Cost (excl. VAT)");
            put("entries", "عدد القيود", "Entries");
            put("number", "الرقم", "No.");
            put("date", "التاريخ", "Date");
            put("customer", "العميل", "Customer");
            put("bookingValue", "قيمة الطلب", "Booking value");
            put("invoiceNo", "رقم الفاتورة", "Invoice no.");
            put("bookingNo", "رقم الطلب", "Booking no.");
            put("am", "ص", "AM");
            put("pm", "م", "PM");
            put("gran.DAY", "يومي", "daily");
            put("gran.WEEK", "أسبوعي", "weekly");
            put("gran.MONTH", "شهري", "monthly");
            put("gran.QUARTER", "ربع سنوي", "quarterly");
            put("gran.YEAR", "سنوي", "yearly");
            String[][] status = {{"NEW", "جديد", "New"}, {"CONFIRMED", "مؤكد", "Confirmed"},
                    {"ASSIGNED", "معيّن لفني", "Assigned"}, {"ON_THE_WAY", "في الطريق", "On the way"},
                    {"IN_PROGRESS", "قيد التنفيذ", "In progress"}, {"COMPLETED", "مكتمل", "Completed"},
                    {"CANCELLED", "ملغي", "Cancelled"}, {"NO_SHOW", "لم يحضر العميل", "No-show"}};
            for (String[] s : status) {
                put("status." + s[0], s[1], s[2]);
            }
            String[][] inv = {{"ISSUED", "صادرة", "Issued"}, {"PARTIALLY_PAID", "مدفوعة جزئياً", "Partially paid"},
                    {"PAID", "مدفوعة", "Paid"}, {"VOID", "ملغاة", "Void"}};
            for (String[] s : inv) {
                put("inv." + s[0], s[1], s[2]);
            }
            String[][] days = {{"0", "الأحد", "Sunday"}, {"1", "الاثنين", "Monday"}, {"2", "الثلاثاء", "Tuesday"},
                    {"3", "الأربعاء", "Wednesday"}, {"4", "الخميس", "Thursday"}, {"5", "الجمعة", "Friday"},
                    {"6", "السبت", "Saturday"}};
            for (String[] s : days) {
                put("dow." + s[0], s[1], s[2]);
            }
            String[][] cats = {{"RENT", "إيجار", "Rent"}, {"FUEL", "وقود", "Fuel"}, {"TRANSPORT", "نقل ومواصلات", "Transport"},
                    {"SUPPLIES", "مواد ومستهلكات", "Supplies"}, {"EQUIPMENT", "معدات", "Equipment"},
                    {"MAINTENANCE", "صيانة", "Maintenance"}, {"MARKETING", "تسويق", "Marketing"},
                    {"UTILITIES", "كهرباء وماء واتصالات", "Utilities"}, {"SOFTWARE", "برامج واشتراكات", "Software"},
                    {"GOVERNMENT_FEES", "رسوم حكومية", "Government fees"}, {"INSURANCE", "تأمين", "Insurance"},
                    {"OTHER", "أخرى", "Other"}};
            for (String[] s : cats) {
                put("cat." + s[0], s[1], s[2]);
            }
        }

        private static void put(String key, String ar, String en) {
            T.put(key, new String[] {ar, en});
        }

        String t(String key) {
            String[] v = T.get(key);
            return v == null ? key : v[ar ? 0 : 1];
        }

        String name(String arName, String enName) {
            return ar || enName == null || enName.isBlank() ? (arName == null ? "" : arName) : enName;
        }
    }
}
