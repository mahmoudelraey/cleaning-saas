package com.fieldops.app.reporting;

import java.time.LocalDate;

import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.RequiresFeature;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Business reports (revenue included), so owners only. */
@RestController
@RequestMapping("/api/v1/reports")
@RequiresFeature(PlanFeature.REPORTS)
@PreAuthorize("hasRole('OWNER')")
public class ReportController {

    private final ReportService reports;

    public ReportController(ReportService reports) {
        this.reports = reports;
    }

    /** @param from first day (inclusive), @param to last day (inclusive), company time zone. */
    @GetMapping("/summary")
    public ReportService.Summary summary(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                         @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reports.summary(from, to);
    }
}
