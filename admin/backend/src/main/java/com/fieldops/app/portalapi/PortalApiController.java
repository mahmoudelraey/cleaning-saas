package com.fieldops.app.portalapi;

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
import com.fieldops.app.booking.CalendarService;
import com.fieldops.app.booking.PaymentMethod;
import com.fieldops.app.catalog.PricingType;
import com.fieldops.app.catalog.ServiceOffering;
import com.fieldops.app.customer.Customer;
import com.fieldops.app.publicpage.OtpService;
import com.fieldops.app.tenant.Tenant;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** See {@link InternalTokenFilter}: callable only by the portal backend. */
@RestController
@RequestMapping("/internal/portal/{slug}")
public class PortalApiController {

    private final PortalApiService service;

    public PortalApiController(PortalApiService service) {
        this.service = service;
    }

    @GetMapping
    public CompanyDto company(@PathVariable String slug) {
        Tenant t = service.company(slug);
        return new CompanyDto(t.getId(), t.getName(), t.getSlug(), t.getLogoUrl(), t.getPhone(), t.getTimezone(),
                service.bookingOpen(t), t.isVatRegistered(), t.isPricesIncludeVat(), PortalApiService.MAX_DAYS_AHEAD,
                (int) CalendarService.PUBLIC_LEAD_TIME.toHours(), (int) PortalApiService.CANCEL_NOTICE.toHours());
    }

    @PostMapping("/otp")
    public OtpDto sendCode(@PathVariable String slug, @Valid @RequestBody PhoneRequest req) {
        OtpService.Sent s = service.sendCode(slug, req.phone());
        return new OtpDto(s.expiresAt(), s.resendAfterSeconds(), s.devCode());
    }

    @PostMapping("/otp/verify")
    public PortalApiService.Identity verify(@PathVariable String slug, @Valid @RequestBody VerifyRequest req) {
        return service.verify(slug, req.phone(), req.code());
    }

    @PostMapping("/customers")
    @ResponseStatus(HttpStatus.CREATED)
    public CustomerDto register(@PathVariable String slug, @Valid @RequestBody RegisterRequest req) {
        return CustomerDto.of(service.register(slug, req.phone(), req.name()));
    }

    @PutMapping("/customers/{customerId}")
    public CustomerDto rename(@PathVariable String slug, @PathVariable UUID customerId,
                              @Valid @RequestBody ProfileRequest req) {
        return CustomerDto.of(service.rename(slug, customerId, req.name(), req.email()));
    }

    @GetMapping("/services")
    public List<ServiceDto> services(@PathVariable String slug) {
        return service.services(slug).stream().map(ServiceDto::of).toList();
    }

    @PostMapping("/quote")
    public QuoteDto quote(@PathVariable String slug, @Valid @RequestBody ItemsRequest req) {
        BookingPricing.Priced p = service.quote(slug, lines(req.items()));
        return new QuoteDto(p.items().stream().map(i -> new QuoteItemDto(i.getDescription(), i.getQuantity(),
                i.getTotalHalalas())).toList(), p.subtotalHalalas(), p.durationMin());
    }

    @PostMapping("/availability")
    public List<SlotDto> availability(@PathVariable String slug, @Valid @RequestBody AvailabilityRequest req) {
        return service.availability(slug, req.date(), lines(req.items())).stream()
                .map(s -> new SlotDto(s.start(), s.end())).toList();
    }

    @PostMapping("/customers/{customerId}/bookings")
    @ResponseStatus(HttpStatus.CREATED)
    public BookedDto book(@PathVariable String slug, @PathVariable UUID customerId, @Valid @RequestBody BookRequest req) {
        Booking b = service.book(slug, customerId, new PortalApiService.NewBooking(lines(req.items()), req.scheduledStart(),
                req.addressId(), req.address() == null ? null : new PortalApiService.AddressInput(req.address().city(),
                req.address().district(), req.address().details(), req.address().lat(), req.address().lng(),
                req.address().mapUrl(), req.address().cityId(), req.address().districtId()),
                req.notes(), req.paymentMethod()));
        return BookedDto.of(b);
    }

    @PostMapping("/customers/{customerId}/bookings/{bookingId}/cancel")
    public BookedDto cancel(@PathVariable String slug, @PathVariable UUID customerId, @PathVariable UUID bookingId,
                            @Valid @RequestBody CancelRequest req) {
        return BookedDto.of(service.cancel(slug, customerId, bookingId, req.reason()));
    }

    @PostMapping("/customers/{customerId}/invoices/{invoiceId}/link")
    public LinkDto invoiceLink(@PathVariable String slug, @PathVariable UUID customerId, @PathVariable UUID invoiceId) {
        return new LinkDto(service.invoiceLink(slug, customerId, invoiceId));
    }

    private static List<BookingPricing.Line> lines(List<ItemRequest> items) {
        return items.stream().map(i -> new BookingPricing.Line(i.serviceId(), i.quantity(), i.addonIds())).toList();
    }

    // --- shapes -----------------------------------------------------------------------------------------

    public record PhoneRequest(@NotBlank @Size(max = 20) String phone) {
    }

    public record VerifyRequest(@NotBlank @Size(max = 20) String phone, @NotBlank @Size(max = 6) String code) {
    }

    public record RegisterRequest(@NotBlank @Size(max = 20) String phone, @NotBlank @Size(max = 150) String name) {
    }

    public record ProfileRequest(@NotBlank @Size(max = 150) String name, @Size(max = 200) String email) {
    }

    public record ItemRequest(@NotNull UUID serviceId, BigDecimal quantity, @Size(max = 20) List<UUID> addonIds) {
    }

    public record ItemsRequest(@NotEmpty @Size(max = 10) List<@Valid ItemRequest> items) {
    }

    public record AvailabilityRequest(@NotNull LocalDate date, @NotEmpty @Size(max = 10) List<@Valid ItemRequest> items) {
    }

    public record AddressRequest(@Size(max = 80) String city, @Size(max = 80) String district,
                                 @Size(max = 300) String details, BigDecimal lat, BigDecimal lng,
                                 @Size(max = 500) String mapUrl, Integer cityId, Long districtId) {
    }

    public record BookRequest(@NotEmpty @Size(max = 10) List<@Valid ItemRequest> items, @NotNull Instant scheduledStart,
                              UUID addressId, @Valid AddressRequest address, @Size(max = 1000) String notes,
                              PaymentMethod paymentMethod) {
    }

    public record CancelRequest(@Size(max = 500) String reason) {
    }

    public record CompanyDto(UUID tenantId, String name, String slug, String logoUrl, String phone, String timezone,
                             boolean bookingOpen, boolean vatRegistered, boolean pricesIncludeVat, int maxDaysAhead,
                             int leadTimeHours, int cancelNoticeHours) {
    }

    public record OtpDto(Instant expiresAt, int resendAfterSeconds, String devCode) {
    }

    public record CustomerDto(UUID id, String name, String phone, String email) {
        static CustomerDto of(Customer c) {
            return new CustomerDto(c.getId(), c.getName(), c.getPhone(), c.getEmail());
        }
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

    public record SlotDto(Instant start, Instant end) {
    }

    public record BookedDto(UUID id, long number, String status, Instant scheduledStart, Instant scheduledEnd,
                            long subtotalHalalas) {
        static BookedDto of(Booking b) {
            return new BookedDto(b.getId(), b.getNumber(), b.getStatus().name(), b.getScheduledStart(),
                    b.getScheduledEnd(), b.getSubtotalHalalas());
        }
    }

    public record LinkDto(String url) {
    }
}
