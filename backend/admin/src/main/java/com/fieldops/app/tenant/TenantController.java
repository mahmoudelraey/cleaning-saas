package com.fieldops.app.tenant;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.common.util.SaudiMobile;
import com.fieldops.app.google.GooglePlacesClient;
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
    private final GooglePlacesClient google;
    private final PlanLimitService limits;

    public TenantController(TenantService service, TenantLogoService logos, GooglePlacesClient google,
                            PlanLimitService limits) {
        this.limits = limits;
        this.service = service;
        this.logos = logos;
        this.google = google;
    }

    private TenantDto dto(Tenant t) {
        return TenantDto.of(t, service.planOf(t), limits.limits(t), google.configured());
    }

    /** Public: used by the pricing page. */
    @GetMapping("/plans")
    public List<PlanDto> plans() {
        return service.activePlans().stream().map(PlanDto::sold).toList();
    }

    @GetMapping("/tenant")
    public TenantDto current() {
        Tenant t = service.current();
        return dto(t);
    }

    @PutMapping("/tenant")
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto update(@Valid @RequestBody UpdateTenantRequest req) {
        // The mobile number is edited with the contact details; this form leaves it as is unless it sends one.
        String phone = req.phone() == null ? service.current().getPhone()
                : req.phone().isBlank() ? null : PhoneNumbers.normalizeSaudiMobile(req.phone()).orElseThrow();
        Tenant t = service.updateCurrent(new TenantService.ProfileUpdate(req.name(), phone,
                blankToNull(req.vatNumber()), blankToNull(req.address()), blankToNull(req.commercialRegistration()),
                Boolean.TRUE.equals(req.pricesIncludeVat()), req.autoInvoice(), req.nameEn(), req.addressEn()));
        return dto(t);
    }

    /** Changes the company link used by the customer portal and the booking page. */
    @RequiresFeature(PlanFeature.BOOKING_PAGE) // customer portal only
    @PutMapping("/tenant/slug")
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto changeSlug(@Valid @RequestBody ChangeSlugRequest req) {
        Tenant t = service.changeSlug(req.slug());
        return dto(t);
    }

    public record ChangeSlugRequest(@NotBlank @Size(max = 40) String slug) {
    }

    /** Content of the company's public page in the customer portal. Empty fields hide their section. */
    @RequiresFeature(PlanFeature.BOOKING_PAGE) // customer portal only
    @PutMapping("/tenant/public-page")
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto updatePublicPage(@Valid @RequestBody PublicPageRequest req) {
        Tenant t = service.updatePublicPage(new PublicPage(req.headline(), req.about(), req.areas(), req.hours(),
                null, null, null, null, null, req.foundedYear(), req.teamSize(), req.promises(), null,
                req.headlineEn(), req.aboutEn(), req.promisesEn(), req.areasEn(), req.hoursEn(), req.heroTitle(),
                req.heroTitleEn()));
        return dto(t);
    }

    /** Mobile number, WhatsApp and social accounts shown to customers (portal header, footer, Contact us). */
    @PutMapping("/tenant/contact")
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto updateContact(@Valid @RequestBody ContactRequest req) {
        Tenant t = service.updateContact(new TenantService.ContactDetails(mobile(req.phone()), mobile(req.whatsapp()),
                req.facebook(), req.instagram(), req.tiktok(), req.snapchat(), req.x()));
        return dto(t);
    }

    public record ContactRequest(@SaudiMobile String phone, @SaudiMobile String whatsapp, @Size(max = 300) String facebook,
                                 @Size(max = 200) String instagram, @Size(max = 200) String tiktok,
                                 @Size(max = 200) String snapchat, @Size(max = 200) String x) {
    }

    private static String mobile(String raw) {
        return raw == null || raw.isBlank() ? null : PhoneNumbers.normalizeSaudiMobile(raw).orElseThrow();
    }

    public record PublicPageRequest(@Size(max = 120) String headline, @Size(max = 2000) String about,
                                    @Size(max = 300) String areas, @Size(max = 150) String hours,
                                    @Min(1950) @Max(2100) Integer foundedYear, @Min(1) @Max(10000) Integer teamSize,
                                    @Size(max = 1000) String promises, @Size(max = 120) String headlineEn,
                                    @Size(max = 2000) String aboutEn, @Size(max = 1000) String promisesEn,
                                    @Size(max = 300) String areasEn, @Size(max = 150) String hoursEn,
                                    @Size(max = 120) String heroTitle, @Size(max = 120) String heroTitleEn) {
    }

    @RequiresFeature(PlanFeature.BOOKING_PAGE) // customer portal only
    @PutMapping("/tenant/booking-page")
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto updateBookingPage(@Valid @RequestBody BookingPageRequest req) {
        Tenant t = service.updateBookingPage(req.enabled(), req.note());
        return dto(t);
    }

    public record BookingPageRequest(boolean enabled, @Size(max = 500) String note) {
    }

    @RequiresFeature(PlanFeature.BRANDING)
    @PostMapping(path = "/tenant/logo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto uploadLogo(@RequestPart("file") MultipartFile file) {
        Tenant t = logos.upload(file);
        return dto(t);
    }

    @DeleteMapping("/tenant/logo")
    @PreAuthorize("hasRole('OWNER')")
    public TenantDto removeLogo() {
        Tenant t = logos.remove();
        return dto(t);
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
            Boolean autoInvoice,
            @Size(max = 150) String nameEn,
            @Size(max = 300) String addressEn) {
    }

    /** The connected Google Maps listing, if any; {@code available} = a Places API key is set on the server. */
    public record GoogleDto(boolean available, String placeId, String name) {
    }

    /** {@code monthlyMessages} / {@code monthlyBookings}: null = unlimited. */
    public record PlanDto(String id, String nameAr, String nameEn, long priceMonthlyHalalas,
                          Long priceYearlyHalalas, int maxTechnicians, Integer monthlyMessages,
                          Integer monthlyBookings, List<String> features) {
        /** The plan as sold (pricing page, upgrade dialog): its own features and limits. */
        static PlanDto sold(Plan p) {
            return new PlanDto(p.getId(), p.getNameAr(), p.getNameEn(), p.getPriceMonthlyHalalas(),
                    p.getPriceYearlyHalalas(), p.getMaxTechnicians(), p.getMonthlyMessages(),
                    p.getMonthlyBookings(), p.getFeatures());
        }

        /**
         * The company's plan: features it can use now (everything while on trial) and its limits in effect
         * (the platform admin may have set this company's own).
         */
        static PlanDto of(Plan p, TenantStatus status, PlanLimitService.Limits limits) {
            return new PlanDto(p.getId(), p.getNameAr(), p.getNameEn(), p.getPriceMonthlyHalalas(),
                    p.getPriceYearlyHalalas(), limits.maxTechnicians(), limits.monthlyMessages(),
                    limits.monthlyBookings(), List.copyOf(PlanFeature.effective(p.getFeatures(), status)));
        }
    }

    public record TenantDto(UUID id, String name, String nameEn, String slug, String logoUrl, String phone, String vatNumber,
                            String address, String addressEn, String commercialRegistration, boolean pricesIncludeVat,
                            boolean autoInvoice, boolean bookingPageEnabled, String bookingPageNote,
                            String timezone, String status, Instant trialEndsAt, PlanDto plan,
                            PublicPage publicPage, GoogleDto google) {
        static TenantDto of(Tenant t, Plan plan, PlanLimitService.Limits limits, boolean googleAvailable) {
            return new TenantDto(t.getId(), t.getName(), t.getNameEn(), t.getSlug(), t.getLogoUrl(), t.getPhone(),
                    t.getVatNumber(), t.getAddress(), t.getAddressEn(), t.getCommercialRegistration(), t.isPricesIncludeVat(),
                    t.isAutoInvoice(), t.isBookingPageEnabled(), t.getBookingPageNote(),
                    t.getTimezone(), t.getStatus().name(), t.getTrialEndsAt(), PlanDto.of(plan, t.getStatus(), limits), t.getPublicPage(),
                    new GoogleDto(googleAvailable, t.getGooglePlaceId(), t.getGooglePlaceName()));
        }
    }
}
