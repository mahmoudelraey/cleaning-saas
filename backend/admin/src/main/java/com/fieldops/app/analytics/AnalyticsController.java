package com.fieldops.app.analytics;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.fieldops.app.analytics.AnalyticsDtos.Granularity;
import com.fieldops.app.analytics.AnalyticsDtos.Overview;
import com.fieldops.app.analytics.AnalyticsDtos.RecordKind;
import com.fieldops.app.analytics.AnalyticsDtos.RecordPage;
import com.fieldops.app.analytics.AnalyticsDtos.RegionAnalytics;
import com.fieldops.app.analytics.AnalyticsDtos.Sales;
import com.fieldops.app.analytics.AnalyticsDtos.ServiceAnalytics;
import com.fieldops.app.analytics.AnalyticsDtos.TimeAnalytics;
import com.fieldops.app.analytics.export.AnalyticsExportService;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.RequiresFeature;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Business-intelligence dashboards. Owners see everything; coordinators reach these APIs only with the Reports
 * screen (sales: the Sales screen, see ScreenAccessInterceptor) and never get costs, salaries or profit (the
 * service leaves them null).
 *
 * <p>Common filters: {@code from}/{@code to} (inclusive days, company time zone), {@code regionId},
 * {@code cityId}, {@code serviceId}, {@code status} (repeatable) and {@code compare} (NONE, PREVIOUS, YEAR).
 */
@RestController
@RequestMapping("/api/v1/analytics")
@RequiresFeature(PlanFeature.REPORTS)
@PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
public class AnalyticsController {

    private final AnalyticsService analytics;
    private final AnalyticsExportService exports;

    public AnalyticsController(AnalyticsService analytics, AnalyticsExportService exports) {
        this.analytics = analytics;
        this.exports = exports;
    }

    @GetMapping("/overview")
    public Overview overview(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                             @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                             @RequestParam(required = false) Integer regionId,
                             @RequestParam(required = false) Integer cityId,
                             @RequestParam(required = false) UUID serviceId,
                             @RequestParam(required = false) List<BookingStatus> status,
                             @RequestParam(required = false) AnalyticsFilter.Compare compare,
                             @RequestParam(required = false) Granularity granularity) {
        return analytics.overview(filter(from, to, regionId, cityId, serviceId, status, compare), granularity);
    }

    @GetMapping("/services")
    public ServiceAnalytics services(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                     @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                     @RequestParam(required = false) Integer regionId,
                                     @RequestParam(required = false) Integer cityId,
                                     @RequestParam(required = false) UUID serviceId,
                                     @RequestParam(required = false) List<BookingStatus> status,
                                     @RequestParam(required = false) AnalyticsFilter.Compare compare) {
        return analytics.services(filter(from, to, regionId, cityId, serviceId, status, compare));
    }

    @GetMapping("/regions")
    public RegionAnalytics regions(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                   @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                   @RequestParam(required = false) Integer regionId,
                                   @RequestParam(required = false) Integer cityId,
                                   @RequestParam(required = false) UUID serviceId,
                                   @RequestParam(required = false) List<BookingStatus> status) {
        return analytics.regions(filter(from, to, regionId, cityId, serviceId, status, AnalyticsFilter.Compare.NONE));
    }

    @GetMapping("/time")
    public TimeAnalytics time(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                              @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                              @RequestParam(required = false) Integer regionId,
                              @RequestParam(required = false) Integer cityId,
                              @RequestParam(required = false) UUID serviceId,
                              @RequestParam(required = false) List<BookingStatus> status,
                              @RequestParam(required = false) Granularity granularity) {
        return analytics.time(filter(from, to, regionId, cityId, serviceId, status, AnalyticsFilter.Compare.NONE),
                granularity);
    }

    @GetMapping("/sales")
    public Sales sales(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                       @RequestParam(required = false) Integer regionId,
                       @RequestParam(required = false) Integer cityId,
                       @RequestParam(required = false) UUID serviceId,
                       @RequestParam(required = false) List<BookingStatus> status,
                       @RequestParam(required = false) AnalyticsFilter.Compare compare) {
        return analytics.sales(filter(from, to, regionId, cityId, serviceId, status, compare));
    }

    /** The bookings (REQUESTS) or invoices (REVENUE) behind a chart point. */
    @GetMapping("/records")
    public RecordPage records(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                              @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                              @RequestParam(required = false) Integer regionId,
                              @RequestParam(required = false) Integer cityId,
                              @RequestParam(required = false) UUID serviceId,
                              @RequestParam(required = false) List<BookingStatus> status,
                              @RequestParam(defaultValue = "REQUESTS") RecordKind kind,
                              @RequestParam(required = false) Integer dow,
                              @RequestParam(required = false) Integer hour,
                              @RequestParam(defaultValue = "ar") String lang,
                              @RequestParam(defaultValue = "0") int page,
                              @RequestParam(defaultValue = "25") int size) {
        return analytics.records(filter(from, to, regionId, cityId, serviceId, status, AnalyticsFilter.Compare.NONE),
                kind, dow, hour, "en".equalsIgnoreCase(lang), page, Math.min(size, 100));
    }

    /** Comprehensive report for the period as Excel (format=XLSX) or PDF (format=PDF). */
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                         @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                         @RequestParam(required = false) Integer regionId,
                                         @RequestParam(required = false) Integer cityId,
                                         @RequestParam(required = false) UUID serviceId,
                                         @RequestParam(required = false) List<BookingStatus> status,
                                         @RequestParam(required = false) AnalyticsFilter.Compare compare,
                                         @RequestParam(defaultValue = "XLSX") AnalyticsExportService.Format format,
                                         @RequestParam(defaultValue = "ar") String lang) {
        AnalyticsExportService.Export e = exports.export(
                filter(from, to, regionId, cityId, serviceId, status, compare), format, lang);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(e.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(e.filename(), StandardCharsets.UTF_8).build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(e.content());
    }

    private static AnalyticsFilter filter(LocalDate from, LocalDate to, Integer regionId, Integer cityId,
                                          UUID serviceId, List<BookingStatus> status,
                                          AnalyticsFilter.Compare compare) {
        Set<BookingStatus> statuses = status == null || status.isEmpty() ? Set.of() : EnumSet.copyOf(status);
        return new AnalyticsFilter(from, to, regionId, cityId, serviceId, statuses, compare);
    }
}
