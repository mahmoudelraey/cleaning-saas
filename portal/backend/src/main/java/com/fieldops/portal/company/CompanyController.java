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
import com.fieldops.app.customerportal.CustomerPortalService;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.portal.config.PortalProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public part of a company's portal: who they are, what they offer, prices and open times. */
@RestController
@RequestMapping("/api/portal/{slug}")
public class CompanyController {

    private final CustomerPortalService portal;
    private final String adminPublicUrl;

    public CompanyController(CustomerPortalService portal, PortalProperties props) {
        this.portal = portal;
        String url = props.adminPublicUrl();
        this.adminPublicUrl = url == null ? "" : url.replaceAll("/+$", "");
    }

    @GetMapping
    public CompanyDto company(@PathVariable String slug) {
        Tenant t = portal.company(slug);
        // Logos are served by the admin backend's public endpoint (it holds the uploaded files).
        String logo = t.getLogoUrl() != null && t.getLogoUrl().startsWith("/") ? adminPublicUrl + t.getLogoUrl() : t.getLogoUrl();
        return new CompanyDto(t.getId(), t.getName(), t.getSlug(), logo, t.getPhone(), t.getTimezone(),
                portal.bookingOpen(t), t.isVatRegistered(), t.isPricesIncludeVat(), CustomerPortalService.MAX_DAYS_AHEAD,
                (int) CalendarService.PUBLIC_LEAD_TIME.toHours(), (int) CustomerPortalService.CANCEL_NOTICE.toHours());
    }

    @GetMapping("/services")
    public List<ServiceDto> services(@PathVariable String slug) {
        return portal.services(slug).stream().map(ServiceDto::of).toList();
    }

    @PostMapping("/quote")
    public QuoteDto quote(@PathVariable String slug, @Valid @RequestBody ItemsRequest req) {
        BookingPricing.Priced p = portal.quote(slug, lines(req.items()));
        return new QuoteDto(p.items().stream().map(i -> new QuoteItemDto(i.getDescription(), i.getQuantity(),
                i.getTotalHalalas())).toList(), p.subtotalHalalas(), p.durationMin());
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

    public record AvailabilityRequest(@NotNull LocalDate date, @NotEmpty @Size(max = 10) List<@Valid ItemRequest> items) {
    }

    public record CompanyDto(UUID tenantId, String name, String slug, String logoUrl, String phone, String timezone,
                             boolean bookingOpen, boolean vatRegistered, boolean pricesIncludeVat, int maxDaysAhead,
                             int leadTimeHours, int cancelNoticeHours) {
    }

    public record AddonDto(UUID id, String name, long priceHalalas) {
    }

    public record ServiceDto(UUID id, String name, String description, PricingType pricingType, long basePriceHalalas,
                             int durationMin, List<AddonDto> addons) {
        static ServiceDto of(ServiceOffering s) {
            return new ServiceDto(s.getId(), s.getName(), s.getDescription(), s.getPricingType(), s.getBasePriceHalalas(),
                    s.getDurationMin(), s.getAddons().stream().filter(a -> a.isActive())
                    .map(a -> new AddonDto(a.getId(), a.getName(), a.getPriceHalalas())).toList());
        }
    }

    public record QuoteItemDto(String description, BigDecimal quantity, long totalHalalas) {
    }

    public record QuoteDto(List<QuoteItemDto> items, long subtotalHalalas, int durationMin) {
    }

    public record SlotDto(java.time.Instant start, java.time.Instant end) {
    }
}
