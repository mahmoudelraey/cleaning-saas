package com.fieldops.app.finance;

import java.util.UUID;

import com.fieldops.app.analytics.AnalyticsDtos.FinanceSummary;
import com.fieldops.app.analytics.AnalyticsService;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.RequiresFeature;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Profit and loss by month (revenue, salaries, expenses) and service costs. Owner only: it reveals salaries. */
@RestController
@RequestMapping("/api/v1/finance")
@RequiresFeature(PlanFeature.REPORTS)
@PreAuthorize("hasRole('OWNER')")
public class FinanceController {

    private final AnalyticsService analytics;
    private final ServiceCostService costs;

    public FinanceController(AnalyticsService analytics, ServiceCostService costs) {
        this.analytics = analytics;
        this.costs = costs;
    }

    /** Twelve months of the year next to the year before. */
    @GetMapping("/summary")
    public FinanceSummary summary(@RequestParam int year) {
        return analytics.finance(year);
    }

    @PutMapping("/service-costs/{serviceId}")
    public ResponseEntity<Void> setServiceCost(@PathVariable UUID serviceId, @RequestBody CostRequest req) {
        costs.setCost(serviceId, req.costHalalas());
        return ResponseEntity.noContent().build();
    }

    public record CostRequest(Long costHalalas) {
    }
}
