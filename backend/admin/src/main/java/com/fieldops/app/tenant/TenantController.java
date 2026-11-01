package com.fieldops.app.tenant;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.common.util.SaudiMobile;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class TenantController {

    private final TenantService service;
    private final TenantLogoService logos;

    public TenantController(TenantService service, TenantLogoService logos) {
        this.service = service;
        this.logos = logos;
    }

    /** Public: used by the pricing page. */
    @GetMapping("/plans")
    public List<PlanDto> plans() {
        return service.activePlans().stream().map(PlanDto::of).toList();
    }

    @GetMapping("/tenant")
    public TenantDto current() {
        Tenant t = service.current();
        return TenantDto.of(t, service.planOf(t));
    }

    @PutMapping("/tenant")
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto update(@Valid @RequestBody UpdateTenantRequest req) {
        String phone = req.phone() == null || req.phone().isBlank()
                ? null : PhoneNumbers.normalizeSaudiMobile(req.phone()).orElseThrow();
        Tenant t = service.updateCurrent(new TenantService.ProfileUpdate(req.name(), phone,
                blankToNull(req.vatNumber()), blankToNull(req.address()), blankToNull(req.commercialRegistration()),
                Boolean.TRUE.equals(req.pricesIncludeVat()), req.autoInvoice()));
        return TenantDto.of(t, service.planOf(t));
    }

    @PutMapping("/tenant/booking-page")
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto updateBookingPage(@Valid @RequestBody BookingPageRequest req) {
        Tenant t = service.updateBookingPage(req.enabled(), req.note());
        return TenantDto.of(t, service.planOf(t));
    }

    public record BookingPageRequest(boolean enabled, @Size(max = 500) String note) {
    }

    @RequiresFeature(PlanFeature.BRANDING)
    @PostMapping(path = "/tenant/logo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto uploadLogo(@RequestPart("file") MultipartFile file) {
        Tenant t = logos.upload(file);
        return TenantDto.of(t, service.planOf(t));
    }

    @DeleteMapping("/tenant/logo")
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto removeLogo() {
        Tenant t = logos.remove();
        return TenantDto.of(t, service.planOf(t));
    }

    /** Public: the logo for invoices, quotes and the booking page. */
    @GetMapping("/public/tenants/{slug}/logo")
    public ResponseEntity<byte[]> publicLogo(@PathVariable String slug) {
        Tenant t = service.bySlug(slug);
        return logos.load(t)
                .map(l -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(l.contentType()))
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                        .header("X-Content-Type-Options", "nosniff")
                        .body(l.bytes()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public record UpdateTenantRequest(
            @NotBlank @Size(max = 150) String name,
            @SaudiMobile String phone,
            @Pattern(regexp = "^$|^3\\d{13}3$", message = "invalid_vat_number") String vatNumber,
            @Size(max = 300) String address,
            @Pattern(regexp = "^$|^\\d{10}$", message = "invalid_commercial_registration") String commercialRegistration,
            Boolean pricesIncludeVat,
            Boolean autoInvoice) {
    }

    public record PlanDto(String id, String nameAr, String nameEn, long priceMonthlyHalalas,
                          int maxTechnicians, List<String> features) {
        static PlanDto of(Plan p) {
            return new PlanDto(p.getId(), p.getNameAr(), p.getNameEn(), p.getPriceMonthlyHalalas(),
                    p.getMaxTechnicians(), p.getFeatures());
        }
    }

    public record TenantDto(UUID id, String name, String slug, String logoUrl, String phone, String vatNumber,
                            String address, String commercialRegistration, boolean pricesIncludeVat,
                            boolean autoInvoice, boolean bookingPageEnabled, String bookingPageNote,
                            String timezone, String status, Instant trialEndsAt, PlanDto plan) {
        static TenantDto of(Tenant t, Plan plan) {
            return new TenantDto(t.getId(), t.getName(), t.getSlug(), t.getLogoUrl(), t.getPhone(),
                    t.getVatNumber(), t.getAddress(), t.getCommercialRegistration(), t.isPricesIncludeVat(),
                    t.isAutoInvoice(), t.isBookingPageEnabled(), t.getBookingPageNote(),
                    t.getTimezone(), t.getStatus().name(), t.getTrialEndsAt(), PlanDto.of(plan));
        }
    }
}
