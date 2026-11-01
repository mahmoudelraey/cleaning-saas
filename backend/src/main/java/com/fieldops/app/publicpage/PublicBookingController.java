package com.fieldops.app.publicpage;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingPricing;
import com.fieldops.app.catalog.PricingType;
import com.fieldops.app.catalog.ServiceOffering;
import com.fieldops.app.scheduling.SchedulingService;
import com.fieldops.app.tenant.Tenant;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Public booking page API (no login; rate-limited per IP with the rest of /api/v1/public/**). */
@RestController
@RequestMapping("/api/v1/public/booking/{slug}")
public class PublicBookingController {

    private final PublicBookingService service;

    public PublicBookingController(PublicBookingService service) {
        this.service = service;
    }

    @GetMapping
    public PageDto page(@PathVariable String slug) {
        PublicBookingService.Page p = service.page(slug);
        Tenant t = p.tenant();
        return new PageDto(t.getName(), t.getSlug(), t.getLogoUrl(), t.getPhone(), t.getBookingPageNote(),
                t.getTimezone(), t.isVatRegistered(), t.isPricesIncludeVat(),
                PublicBookingService.MAX_DAYS_AHEAD, (int) com.fieldops.app.booking.CalendarService.PUBLIC_LEAD_TIME.toHours(),
                p.services().stream().map(ServiceDto::of).toList());
    }

    @PostMapping("/quote")
    public QuoteDto quote(@PathVariable String slug, @Valid @RequestBody ItemsRequest req) {
        BookingPricing.Priced p = service.quote(slug, lines(req.items()));
        return new QuoteDto(p.items().stream().map(i -> new ItemDto(i.getDescription(), i.getQuantity(),
                i.getTotalHalalas())).toList(), p.subtotalHalalas(), p.durationMin());
    }

    @PostMapping("/availability")
    public List<SlotDto> availability(@PathVariable String slug, @Valid @RequestBody AvailabilityRequest req) {
        return service.availability(slug, req.date(), lines(req.items())).stream()
                .map(SlotDto::of).toList();
    }

    @PostMapping("/otp")
    public OtpDto sendCode(@PathVariable String slug, @Valid @RequestBody OtpRequest req) {
        OtpService.Sent s = service.sendCode(slug, req.phone());
        return new OtpDto(s.expiresAt(), s.resendAfterSeconds(), s.devCode());
    }

    @PostMapping("/otp/verify")
    public SessionDto verify(@PathVariable String slug, @Valid @RequestBody VerifyRequest req) {
        return new SessionDto(service.verifyCode(slug, req.phone(), req.code()));
    }

    @PostMapping("/bookings")
    @ResponseStatus(HttpStatus.CREATED)
    public BookedDto book(@PathVariable String slug, @Valid @RequestBody BookRequest req) {
        Booking b = service.book(slug, new PublicBookingService.BookingRequest(req.sessionToken(), req.name(),
                lines(req.items()), req.scheduledStart(),
                req.address() == null ? null : new PublicBookingService.AddressInput(req.address().city(),
                        req.address().district(), req.address().details(), req.address().lat(), req.address().lng(),
                        req.address().mapUrl(), req.address().cityId(), req.address().districtId()),
                req.notes()));
        return new BookedDto(b.getNumber(), b.getStatus().name(), b.getScheduledStart(), b.getScheduledEnd(),
                b.getSubtotalHalalas());
    }

    private static List<BookingPricing.Line> lines(List<ItemRequest> items) {
        return items.stream().map(i -> new BookingPricing.Line(i.serviceId(), i.quantity(), i.addonIds())).toList();
    }

    // --- shapes -----------------------------------------------------------------------------------------

    public record ItemRequest(@NotNull UUID serviceId, BigDecimal quantity, @Size(max = 20) List<UUID> addonIds) {
    }

    public record ItemsRequest(@NotEmpty @Size(max = 10) List<@Valid ItemRequest> items) {
    }

    public record AvailabilityRequest(@NotNull LocalDate date, @NotEmpty @Size(max = 10) List<@Valid ItemRequest> items) {
    }

    public record OtpRequest(@NotBlank @Size(max = 20) String phone) {
    }

    public record VerifyRequest(@NotBlank @Size(max = 20) String phone, @NotBlank @Size(max = 6) String code) {
    }

    public record AddressRequest(@Size(max = 80) String city, @Size(max = 80) String district,
                                 @Size(max = 300) String details, BigDecimal lat, BigDecimal lng,
                                 @Size(max = 500) String mapUrl, Integer cityId, Long districtId) {
    }

    public record BookRequest(@NotBlank String sessionToken, @NotBlank @Size(max = 150) String name,
                              @NotEmpty @Size(max = 10) List<@Valid ItemRequest> items, @NotNull Instant scheduledStart,
                              @Valid AddressRequest address, @Size(max = 1000) String notes) {
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

    public record PageDto(String name, String slug, String logoUrl, String phone, String note, String timezone,
                          boolean vatRegistered, boolean pricesIncludeVat, int maxDaysAhead, int leadTimeHours,
                          List<ServiceDto> services) {
    }

    public record ItemDto(String description, BigDecimal quantity, long totalHalalas) {
    }

    public record QuoteDto(List<ItemDto> items, long subtotalHalalas, int durationMin) {
    }

    /** Only times, never which technicians are free. */
    public record SlotDto(Instant start, Instant end) {
        static SlotDto of(SchedulingService.Slot s) {
            return new SlotDto(s.start(), s.end());
        }
    }

    public record OtpDto(Instant expiresAt, int resendAfterSeconds, String devCode) {
    }

    public record SessionDto(String sessionToken) {
    }

    public record BookedDto(long number, String status, Instant scheduledStart, Instant scheduledEnd, long subtotalHalalas) {
    }
}
