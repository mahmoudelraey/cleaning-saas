package com.fieldops.portal.company;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fieldops.app.booking.BookingPricing;
import com.fieldops.app.booking.CalendarService;
import com.fieldops.app.catalog.PricingType;
import com.fieldops.app.catalog.ServiceOffering;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.customerportal.CustomerPortalService;
import com.fieldops.app.google.GooglePlacesClient;
import com.fieldops.app.promo.Promo;
import com.fieldops.app.tenant.PublicPage;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.portal.security.CurrentCustomer;
import com.fieldops.portal.config.PortalProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Public part of a company's portal: who they are, what they offer, prices and open times. */
@RestController
@RequestMapping("/api/portal/{slug}")
public class CompanyController {

    private final CustomerPortalService portal;
    private final ReviewQueries reviews;
    private final StatsQueries stats;
    private final GooglePlacesClient google;
    private final String adminPublicUrl;

    public CompanyController(CustomerPortalService portal, ReviewQueries reviews, StatsQueries stats, GooglePlacesClient google,
                             PortalProperties props) {
        this.portal = portal;
        this.reviews = reviews;
        this.stats = stats;
        this.google = google;
        String url = props.adminPublicUrl();
        this.adminPublicUrl = url == null ? "" : url.replaceAll("/+$", "");
    }

    @GetMapping
    public CompanyDto company(@PathVariable String slug) {
        Tenant t = portal.company(slug);
        // Logos are served by the admin backend's public endpoint (it holds the uploaded files).
        String logo = t.getLogoUrl() != null && t.getLogoUrl().startsWith("/") ? adminPublicUrl + t.getLogoUrl() : t.getLogoUrl();
        return new CompanyDto(t.getId(), t.getName(), t.getNameEn(), t.getSlug(), logo, t.getPhone(), t.getTimezone(),
                portal.bookingOpen(t), t.isVatRegistered(), t.isPricesIncludeVat(), CustomerPortalService.MAX_DAYS_AHEAD,
                (int) CalendarService.PUBLIC_LEAD_TIME.toHours(), (int) CustomerPortalService.CANCEL_NOTICE.toHours(),
                t.getPublicPage(), t.getAddress(), google.configured() && t.getGooglePlaceId() != null,
                portal.announcement(t).map(AnnouncementDto::of).orElse(null));
    }

    /**
     * The company's Google rating and up to five Google reviews, fetched live (Google's terms do not allow storing
     * them). The page loads this only when the section comes into view, since every call is billed by Google.
     */
    @GetMapping("/google-reviews")
    public GooglePlacesClient.Details googleReviews(@PathVariable String slug, @RequestParam(defaultValue = "ar") String lang) {
        Tenant t = portal.company(slug);
        if (!google.configured() || t.getGooglePlaceId() == null) {
            throw ApiException.notFound("google_reviews");
        }
        return google.details(t.getGooglePlaceId(), "en".equals(lang) ? "en" : "ar");
    }

    /** Rating summary of every visit, plus the comments the owner chose to show. */
    @GetMapping("/reviews")
    public ReviewQueries.PublicReviews reviews(@PathVariable String slug) {
        Tenant t = portal.company(slug);
        return reviews.forPublicPage(t.getId());
    }

    /** Completed visits, active technicians and customer satisfaction, for the stats band on the public page. */
    @GetMapping("/stats")
    public StatsQueries.Stats stats(@PathVariable String slug) {
        Tenant t = portal.company(slug);
        return stats.forPublicPage(t.getId());
    }

    @GetMapping("/services")
    public List<ServiceDto> services(@PathVariable String slug) {
        return portal.services(slug).stream().map(ServiceDto::of).toList();
    }

    /**
     * Prices the chosen services. With {@code promoCode}, also checks it (for the signed-in customer, if any): the
     * answer then carries the discount and the total, or {@code promoError} with the reason it does not apply.
     */
    @PostMapping("/quote")
    public QuoteDto quote(@PathVariable String slug, @Valid @RequestBody QuoteRequest req) {
        CurrentCustomer me = CurrentCustomer.optional(slug);
        CustomerPortalService.PricedQuote q = portal.quote(slug, lines(req.items()), req.promoCode(),
                me == null ? null : me.customerId());
        BookingPricing.Priced p = q.priced();
        Promo promo = q.promo();
        return new QuoteDto(p.items().stream().map(i -> new QuoteItemDto(i.getServiceId(), i.getAddonId(),
                i.getDescription(), i.getQuantity(), i.getTotalHalalas())).toList(), p.subtotalHalalas(), p.durationMin(),
                q.discountHalalas(), q.totalHalalas(),
                promo == null ? null : new QuotePromoDto(promo.getCode(), promo.getTitle(), promo.getTitleEn()),
                q.promoError());
    }

    @PostMapping("/availability")
    public List<SlotDto> availability(@PathVariable String slug, @Valid @RequestBody AvailabilityRequest req) {
        return portal.availability(slug, req.date(), lines(req.items())).stream()
                .map(s -> new SlotDto(s.start(), s.end())).toList();
    }

    public static List<BookingPricing.Line> lines(List<ItemRequest> items) {
        return items.stream().map(i -> new BookingPricing.Line(i.serviceId(), i.quantity(), i.addonIds())).toList();
    }

    public record ItemRequest(@NotNull UUID serviceId, BigDecimal quantity, @Size(max = 20) List<UUID> addonIds) {
    }

    public record ItemsRequest(@NotEmpty @Size(max = 10) List<@Valid ItemRequest> items) {
    }

    public record QuoteRequest(@NotEmpty @Size(max = 10) List<@Valid ItemRequest> items, @Size(max = 40) String promoCode) {
    }

    public record AvailabilityRequest(@NotNull LocalDate date, @NotEmpty @Size(max = 10) List<@Valid ItemRequest> items) {
    }

    /** {@code name} is Arabic; {@code nameEn} English (may be empty). */
    public record CompanyDto(UUID tenantId, String name, String nameEn, String slug, String logoUrl, String phone, String timezone,
                             boolean bookingOpen, boolean vatRegistered, boolean pricesIncludeVat, int maxDaysAhead,
                             int leadTimeHours, int cancelNoticeHours, PublicPage page, String address,
                             boolean googleReviews, AnnouncementDto announcement) {
    }

    /** The announced promo: the bar at the top of the company page. */
    public record AnnouncementDto(String code, String title, String titleEn, String discountType, long discountValue,
                                  java.time.Instant endsAt, boolean firstBookingOnly) {
        static AnnouncementDto of(Promo p) {
            return new AnnouncementDto(p.getCode(), p.getTitle(), p.getTitleEn(), p.getDiscountType().name(),
                    p.getDiscountValue(), p.getEndsAt(), p.isFirstBookingOnly());
        }
    }

    public record AddonDto(UUID id, String name, String nameEn, long priceHalalas) {
    }

    /** {@code name}/{@code description} are Arabic; the {@code ...En} ones are English (may be empty). */
    public record ServiceDto(UUID id, String name, String description, String nameEn, String descriptionEn,
                             PricingType pricingType, long basePriceHalalas, int durationMin, List<AddonDto> addons) {
        static ServiceDto of(ServiceOffering s) {
            return new ServiceDto(s.getId(), s.getName(), s.getDescription(), s.getNameEn(), s.getDescriptionEn(),
                    s.getPricingType(), s.getBasePriceHalalas(), s.getDurationMin(),
                    s.getAddons().stream().filter(a -> a.isActive())
                            .map(a -> new AddonDto(a.getId(), a.getName(), a.getNameEn(), a.getPriceHalalas())).toList());
        }
    }

    public record QuoteItemDto(UUID serviceId, UUID addonId, String description, BigDecimal quantity, long totalHalalas) {
    }

    public record QuoteDto(List<QuoteItemDto> items, long subtotalHalalas, int durationMin, long discountHalalas,
                           long totalHalalas, QuotePromoDto promo, String promoError) {
    }

    public record QuotePromoDto(String code, String title, String titleEn) {
    }

    public record SlotDto(java.time.Instant start, java.time.Instant end) {
    }
}
