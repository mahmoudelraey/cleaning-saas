package com.fieldops.portal.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.PaymentMethod;
import com.fieldops.app.customerportal.CustomerPortalService;
import com.fieldops.portal.company.CompanyController;
import com.fieldops.portal.security.CurrentCustomer;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/portal/{slug}/bookings")
public class BookingController {

    private final BookingQueries queries;
    private final CustomerPortalService portal;

    public BookingController(BookingQueries queries, CustomerPortalService portal) {
        this.queries = queries;
        this.portal = portal;
    }

    /** @param scope {@code upcoming} (open visits, soonest first) or {@code past} (finished/cancelled, newest first) */
    @GetMapping
    public List<BookingQueries.Summary> list(@PathVariable String slug, @RequestParam(defaultValue = "upcoming") String scope) {
        return queries.list(CurrentCustomer.require(slug), !"past".equals(scope));
    }

    @GetMapping("/{id}")
    public BookingQueries.Detail get(@PathVariable String slug, @PathVariable UUID id) {
        return queries.detail(CurrentCustomer.require(slug), id, (int) CustomerPortalService.CANCEL_NOTICE.toHours());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookedDto book(@PathVariable String slug, @Valid @RequestBody BookRequest req) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        AddressRequest a = req.address();
        return BookedDto.of(portal.book(slug, me.customerId(), new CustomerPortalService.NewBooking(
                CompanyController.lines(req.items()), req.scheduledStart(), req.addressId(),
                a == null ? null : new CustomerPortalService.AddressInput(a.city(), a.district(), a.details(), a.lat(),
                        a.lng(), a.mapUrl(), a.cityId(), a.districtId()),
                req.notes(), req.paymentMethod())));
    }

    @PostMapping("/{id}/cancel")
    public BookedDto cancel(@PathVariable String slug, @PathVariable UUID id, @Valid @RequestBody CancelRequest req) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return BookedDto.of(portal.cancel(slug, me.customerId(), id, req.reason()));
    }

    public record AddressRequest(@Size(max = 80) String city, @Size(max = 80) String district,
                                 @Size(max = 300) String details, BigDecimal lat, BigDecimal lng,
                                 @Size(max = 500) String mapUrl, Integer cityId, Long districtId) {
    }

    public record BookRequest(@NotEmpty @Size(max = 10) List<CompanyController.@Valid ItemRequest> items,
                              @NotNull Instant scheduledStart, UUID addressId, @Valid AddressRequest address,
                              @Size(max = 1000) String notes, PaymentMethod paymentMethod) {
    }

    public record CancelRequest(@Size(max = 500) String reason) {
    }

    public record BookedDto(UUID id, long number, String status, Instant scheduledStart, Instant scheduledEnd,
                            long subtotalHalalas) {
        static BookedDto of(Booking b) {
            return new BookedDto(b.getId(), b.getNumber(), b.getStatus().name(), b.getScheduledStart(),
                    b.getScheduledEnd(), b.getSubtotalHalalas());
        }
    }
}
