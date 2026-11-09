package com.fieldops.app.analytics;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * JSON shapes of the analytics, sales and finance dashboards. Money is in halalas.
 *
 * <p>Fields that reveal costs, salaries or profit are null unless the caller is the owner ({@code financials}),
 * and company-wide costs are null when the data is narrowed to a region, city, service or status
 * ({@code narrowed}): they cannot be split that way.
 */
public final class AnalyticsDtos {

    private AnalyticsDtos() {
    }

    public enum Granularity {
        DAY, WEEK, MONTH, QUARTER, YEAR
    }

    /**
     * Key indicators for one period.
     *
     * @param revenueHalalas    net sales: invoice taxable amounts (after discount, before VAT), by issue date
     * @param grossSalesHalalas invoice totals including VAT
     * @param requests          bookings by appointment date
     * @param avgRevenuePerRequestHalalas revenue ÷ invoiced requests
     * @param expensesHalalas   salaries (spread over their month) + other expenses net of VAT
     */
    public record Kpis(long revenueHalalas, long grossSalesHalalas, long vatHalalas, long invoices,
                       Long collectedHalalas, long requests, long completed, long pending, long cancelled,
                       long noShow, long customers, long avgRevenuePerRequestHalalas, double completionRate,
                       double cancellationRate, Long salaryCostHalalas, Long otherExpensesHalalas,
                       Long expensesHalalas, Long netProfitHalalas, Double profitMargin) {
    }

    /** One bucket of a time series; start/end are the days it covers inside the range (for drill-down). */
    public record Point(LocalDate start, LocalDate end, long revenueHalalas, long requests, long completed,
                        long cancelled) {
    }

    public record StatusCount(String status, long count) {
    }

    public record Overview(LocalDate from, LocalDate to, LocalDate previousFrom, LocalDate previousTo, Kpis current,
                           Kpis previous, Long outstandingHalalas, Granularity granularity, List<Point> trend,
                           List<Point> previousTrend, List<StatusCount> statuses, boolean financials,
                           boolean narrowed) {
    }

    /**
     * Revenue of a booking's invoice is split over its services in proportion to the booked line totals.
     *
     * @param unitCostHalalas   owner-entered direct cost per unit (null = not entered)
     * @param directCostHalalas unit cost × invoiced quantity + expenses tagged to the service (null = unknown)
     * @param profitHalalas     revenue − direct cost (gross profit, before salaries and overheads)
     */
    public record ServiceRow(UUID serviceId, String name, String nameEn, boolean active, long requests,
                             long completed, long cancelled, long revenueHalalas, long previousRevenueHalalas,
                             double share, Long unitCostHalalas, Long directCostHalalas, Long profitHalalas,
                             Double margin) {
    }

    public record ServiceAnalytics(List<ServiceRow> services, long revenueHalalas, long unassignedRevenueHalalas,
                                   boolean financials) {
    }

    public record RegionRow(Integer regionId, String code, String nameAr, String nameEn, long requests,
                            long completed, long cancelled, long revenueHalalas, double share) {
    }

    public record CityRow(Integer cityId, Integer regionId, String nameAr, String nameEn, long requests,
                          long revenueHalalas) {
    }

    public record ServiceRef(UUID serviceId, String name, String nameEn) {
    }

    /** Requests of one service in one region (null region = address without a city). */
    public record Cell(Integer regionId, UUID serviceId, long requests) {
    }

    public record RegionAnalytics(List<RegionRow> regions, List<CityRow> cities, List<ServiceRef> topServices,
                                  List<Cell> matrix, long unknownRequests, long unknownRevenueHalalas) {
    }

    /** dow: 0 = Sunday … 6 = Saturday, hour 0–23, company time zone. */
    public record HeatCell(int dow, int hour, long requests) {
    }

    public record SeasonCell(int year, int month, long requests, long revenueHalalas) {
    }

    public record TimeAnalytics(Granularity granularity, List<Point> series, List<HeatCell> heatmap,
                                List<SeasonCell> seasonal) {
    }

    /** A month, quarter or year: key "2026-11", "2026-Q4" or "2026". */
    public record PeriodRow(String key, LocalDate start, LocalDate end, long revenueHalalas, long grossSalesHalalas,
                            long requests, long completed, long previousRevenueHalalas) {
    }

    public record Sales(LocalDate from, LocalDate to, Kpis current, Kpis previous, List<PeriodRow> months,
                        List<PeriodRow> quarters, List<PeriodRow> years, ServiceAnalytics services,
                        List<RegionRow> regions, List<CityRow> cities, boolean financials) {
    }

    public record FinanceMonth(int month, long revenueHalalas, long collectedHalalas, long salaryCostHalalas,
                               long expensesHalalas, long netProfitHalalas) {
    }

    public record CategoryRow(String category, long costHalalas, long previousCostHalalas) {
    }

    public record FinanceTotals(long revenueHalalas, long collectedHalalas, long salaryCostHalalas,
                                long expensesHalalas, long totalCostHalalas, long netProfitHalalas,
                                double profitMargin) {
    }

    public record FinanceSummary(int year, List<FinanceMonth> months, List<FinanceMonth> previousMonths,
                                 FinanceTotals totals, FinanceTotals previousTotals, List<CategoryRow> categories,
                                 long salariesPaidHalalas, long salariesDueHalalas, long outstandingHalalas) {
    }

    public enum RecordKind {
        REQUESTS, REVENUE
    }

    /**
     * A row behind a chart: a booking (REQUESTS) or an invoice (REVENUE; amount = its revenue within the filter).
     */
    public record RecordRow(UUID id, RecordKind kind, long number, Instant date, String customerName,
                            String services, String cityAr, String cityEn, String status, long amountHalalas,
                            UUID bookingId, Long bookingNumber, Long invoiceNumber) {
    }

    public record RecordPage(List<RecordRow> items, int page, int size, long total, long totalAmountHalalas) {
    }
}
