package com.fieldops.app.platform;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.platform.PlatformService.CompanyDetail;
import com.fieldops.app.platform.PlatformService.CompanyRow;
import com.fieldops.app.platform.PlatformService.General;
import com.fieldops.app.platform.PlatformService.MessagingData;
import com.fieldops.app.platform.PlatformService.MessagingView;
import com.fieldops.app.platform.PlatformService.Overview;
import com.fieldops.app.platform.PlatformService.PlanData;
import com.fieldops.app.platform.PlatformService.PlanRow;
import com.fieldops.app.platform.PlatformService.TestResult;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The FieldOps owner's console. Platform admins only; company staff never reach it. */
@RestController
@RequestMapping("/api/platform")
@PreAuthorize("hasRole('PLATFORM_ADMIN')")
public class PlatformController {

    private final PlatformService platform;

    public PlatformController(PlatformService platform) {
        this.platform = platform;
    }

    @GetMapping("/overview")
    public Overview overview() {
        return platform.overview();
    }

    // --- companies

    @GetMapping("/companies")
    public List<CompanyRow> companies(@RequestParam(required = false) String q,
                                      @RequestParam(required = false) String status) {
        return platform.companies(q, status);
    }

    @GetMapping("/companies/{id}")
    public CompanyDetail company(@PathVariable UUID id) {
        return platform.company(id);
    }

    @PutMapping("/companies/{id}/plan")
    public CompanyDetail changePlan(@PathVariable UUID id, @RequestBody PlanChange req) {
        return platform.changePlan(id, req.planId());
    }

    /** {@code days}: add days to the trial; or {@code until}: trial until that day; or {@code endNow}. */
    @PostMapping("/companies/{id}/trial")
    public CompanyDetail trial(@PathVariable UUID id, @RequestBody TrialChange req) {
        if (req.endNow()) {
            return platform.endTrialNow(id);
        }
        if (req.until() != null) {
            return platform.setTrialEnd(id, req.until());
        }
        return platform.extendTrial(id, req.days() == null ? 0 : req.days());
    }

    @PostMapping("/companies/{id}/activate")
    public CompanyDetail activate(@PathVariable UUID id, @RequestBody Activation req) {
        return platform.activate(id, req.planId(), req.cycle(), req.paidUntil());
    }

    @PostMapping("/companies/{id}/suspend")
    public CompanyDetail suspend(@PathVariable UUID id, @RequestBody(required = false) Note req) {
        return platform.suspend(id, req == null ? null : req.note());
    }

    @PostMapping("/companies/{id}/reactivate")
    public CompanyDetail reactivate(@PathVariable UUID id) {
        return platform.reactivate(id);
    }

    @PostMapping("/companies/{id}/cancel")
    public CompanyDetail cancel(@PathVariable UUID id, @RequestBody(required = false) Note req) {
        return platform.cancel(id, req == null ? null : req.note());
    }

    // --- plans

    @GetMapping("/plans")
    public PlansView plans() {
        return new PlansView(platform.plans(), PlatformService.FEATURES);
    }

    @PostMapping("/plans")
    @ResponseStatus(HttpStatus.CREATED)
    public PlanRow createPlan(@RequestBody PlanData req) {
        return platform.savePlan(req.id(), req, true);
    }

    @PutMapping("/plans/{id}")
    public PlanRow updatePlan(@PathVariable String id, @RequestBody PlanData req) {
        return platform.savePlan(id, req, false);
    }

    @DeleteMapping("/plans/{id}")
    public ResponseEntity<Void> deletePlan(@PathVariable String id) {
        platform.deletePlan(id);
        return ResponseEntity.noContent().build();
    }

    // --- settings

    @GetMapping("/settings")
    public General general() {
        return platform.general();
    }

    @PutMapping("/settings")
    public General updateGeneral(@RequestBody General req) {
        return platform.updateGeneral(req);
    }

    @GetMapping("/messaging")
    public MessagingView messaging() {
        return platform.messaging();
    }

    @PutMapping("/messaging")
    public MessagingView updateMessaging(@RequestBody MessagingData req) {
        return platform.updateMessaging(req);
    }

    @PostMapping("/messaging/test")
    public TestResult test(@RequestBody TestRequest req) {
        return platform.test(req.channel(), req.phone());
    }

    public record PlanChange(String planId) {
    }

    public record TrialChange(Integer days, LocalDate until, boolean endNow) {
    }

    public record Activation(String planId, String cycle, LocalDate paidUntil) {
    }

    public record Note(String note) {
    }

    public record PlansView(List<PlanRow> plans, List<String> features) {
    }

    public record TestRequest(String channel, String phone) {
    }
}
