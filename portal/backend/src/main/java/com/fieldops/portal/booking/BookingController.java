package com.fieldops.portal.booking;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.fieldops.portal.admin.AdminClient;
import com.fieldops.portal.admin.AdminDtos;
import com.fieldops.portal.company.CompanyService;
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
    private final AdminClient admin;
    private final CompanyService companies;

    public BookingController(BookingQueries queries, AdminClient admin, CompanyService companies) {
        this.queries = queries;
        this.admin = admin;
        this.companies = companies;
    }

    /** @param scope {@code upcoming} (open visits, soonest first) or {@code past} (finished/cancelled, newest first) */
    @GetMapping
    public List<BookingQueries.Summary> list(@PathVariable String slug, @RequestParam(defaultValue = "upcoming") String scope) {
        return queries.list(CurrentCustomer.require(slug), !"past".equals(scope));
    }

    @GetMapping("/{id}")
    public BookingQueries.Detail get(@PathVariable String slug, @PathVariable UUID id) {
        return queries.detail(CurrentCustomer.require(slug), id, companies.get(slug).cancelNoticeHours());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminDtos.Booked book(@PathVariable String slug, @Valid @RequestBody BookRequest req) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return admin.post(slug, "/customers/" + me.customerId() + "/bookings",
                new AdminDtos.BookBody(req.items(), req.scheduledStart(), req.addressId(), req.address(), req.notes(),
                        req.paymentMethod()), AdminDtos.Booked.class);
    }

    @PostMapping("/{id}/cancel")
    public AdminDtos.Booked cancel(@PathVariable String slug, @PathVariable UUID id, @Valid @RequestBody CancelRequest req) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return admin.post(slug, "/customers/" + me.customerId() + "/bookings/" + id + "/cancel",
                new AdminDtos.CancelBody(req.reason()), AdminDtos.Booked.class);
    }

    public record BookRequest(@NotEmpty @Size(max = 10) List<AdminDtos.@NotNull Item> items, @NotNull Instant scheduledStart,
                              UUID addressId, AdminDtos.Address address, @Size(max = 1000) String notes,
                              @Pattern(regexp = "CASH|BANK_TRANSFER|MADA|CARD|APPLE_PAY|ONLINE|OTHER") String paymentMethod) {
    }

    public record CancelRequest(@Size(max = 500) String reason) {
    }
}
