package com.fieldops.app.booking;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fieldops.app.common.web.PageResponse;
import com.fieldops.app.scheduling.Assignment;
import com.fieldops.app.scheduling.SchedulingService;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/bookings")
public class BookingController {

    private final BookingService service;
    private final SchedulingService scheduling;

    public BookingController(BookingService service, SchedulingService scheduling) {
        this.service = service;
        this.scheduling = scheduling;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public PageResponse<BookingSummary> list(@RequestParam(required = false) Set<BookingStatus> status,
                                             @RequestParam(required = false) Instant from,
                                             @RequestParam(required = false) Instant to,
                                             @RequestParam(required = false) UUID customerId,
                                             @RequestParam(required = false) UUID technicianId,
                                             @RequestParam(required = false) String q,
                                             @RequestParam(defaultValue = "desc") String order,
                                             @RequestParam(defaultValue = "0") @Min(0) int page,
                                             @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        Sort sort = Sort.by("asc".equalsIgnoreCase(order) ? Sort.Direction.ASC : Sort.Direction.DESC, "scheduledStart");
        var result = service.search(new BookingService.Filter(status, from, to, customerId, technicianId, q),
                PageRequest.of(page, size, sort));
        Map<UUID, List<Assignment>> assigned = scheduling.forBookings(
                result.getContent().stream().map(Booking::getId).toList());
        return PageResponse.of(result, b -> BookingSummary.of(b, assigned.getOrDefault(b.getId(), List.of())));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR','TECHNICIAN')")
    public BookingDetail get(@PathVariable UUID id) {
        return BookingDetail.of(service.detail(id));
    }

    /** Live price + duration while the user is filling the form. Nothing is saved. */
    @PostMapping("/price-preview")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public PricePreview preview(@Valid @RequestBody PreviewRequest req) {
        return PricePreview.of(service.preview(req.toLines()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public BookingDetail create(@Valid @RequestBody BookingRequest req) {
        Booking b = service.create(req.toCommand(), BookingSource.MANUAL, req.technicianIds(), req.forceOrFalse());
        return BookingDetail.of(service.detail(b.getId()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public BookingDetail update(@PathVariable UUID id, @Valid @RequestBody BookingRequest req) {
        service.update(id, req.toCommand(), req.forceOrFalse());
        return BookingDetail.of(service.detail(id));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR','TECHNICIAN')")
    public BookingDetail changeStatus(@PathVariable UUID id, @Valid @RequestBody StatusRequest req) {
        service.changeStatus(id, req.status(), req.reason());
        return BookingDetail.of(service.detail(id));
    }

    @PostMapping("/{id}/assign")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public BookingDetail assign(@PathVariable UUID id, @Valid @RequestBody AssignRequest req) {
        service.assign(id, req.technicianIds(), Boolean.TRUE.equals(req.force()));
        return BookingDetail.of(service.detail(id));
    }

    @DeleteMapping("/{id}/assign")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public BookingDetail unassign(@PathVariable UUID id) {
        service.unassign(id);
        return BookingDetail.of(service.detail(id));
    }

    @PostMapping("/{id}/notes")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR','TECHNICIAN')")
    public EventDto addNote(@PathVariable UUID id, @Valid @RequestBody NoteRequest req) {
        return EventDto.of(service.addNote(id, req.note()));
    }

    // --- Requests --------------------------------------------------------------------------------------

    public record LineRequest(@NotNull UUID serviceId,
                              BigDecimal quantity,
                              @Size(max = 20) List<UUID> addonIds) {
        BookingPricing.Line toLine() {
            return new BookingPricing.Line(serviceId, quantity, addonIds);
        }
    }

    public record PreviewRequest(@NotEmpty @Size(max = 20) List<@Valid LineRequest> items) {
        List<BookingPricing.Line> toLines() {
            return items.stream().map(LineRequest::toLine).toList();
        }
    }

    public record BookingRequest(
            @NotNull UUID customerId,
            UUID addressId,
            @NotNull Instant scheduledStart,
            @Min(15) @Max(1440) Integer durationMin,
            @NotEmpty @Size(max = 20) List<@Valid LineRequest> items,
            @Size(max = 2000) String notes,
            @Size(max = 2000) String internalNotes,
            @Size(max = 10) List<UUID> technicianIds,
            Boolean force,
            PaymentMethod paymentMethod) {

        BookingService.BookingCommand toCommand() {
            return new BookingService.BookingCommand(customerId, addressId, scheduledStart, durationMin,
                    items.stream().map(LineRequest::toLine).toList(), notes, internalNotes, paymentMethod);
        }

        boolean forceOrFalse() {
            return Boolean.TRUE.equals(force);
        }
    }

    public record StatusRequest(@NotNull BookingStatus status, @Size(max = 500) String reason) {
    }

    public record AssignRequest(@NotEmpty @Size(max = 10) List<UUID> technicianIds, Boolean force) {
    }

    public record NoteRequest(@NotNull @Size(min = 1, max = 1000) String note) {
    }

    // --- Responses -------------------------------------------------------------------------------------

    public record TechnicianRef(UUID id, String name, String color) {
        static TechnicianRef of(Assignment a) {
            return new TechnicianRef(a.getTechnician().getId(), a.getTechnician().getUser().getName(),
                    a.getTechnician().getColor());
        }
    }

    public record BookingSummary(UUID id, long number, BookingStatus status, BookingSource source,
                                 Instant scheduledStart, Instant scheduledEnd, UUID customerId, String customerName,
                                 String customerPhone, String addressText, long subtotalHalalas,
                                 List<TechnicianRef> technicians, PaymentMethod paymentMethod, List<String> services) {
        static BookingSummary of(Booking b, List<Assignment> assigned) {
            return new BookingSummary(b.getId(), b.getNumber(), b.getStatus(), b.getSource(), b.getScheduledStart(),
                    b.getScheduledEnd(), b.getCustomerId(), b.getCustomerName(), b.getCustomerPhone(),
                    b.getAddressText(), b.getSubtotalHalalas(), assigned.stream().map(TechnicianRef::of).toList(),
                    b.getPaymentMethod(),
                    // main services only (add-ons are extras on a line, not a service type)
                    b.getItems().stream().filter(i -> i.getAddonId() == null).map(BookingItem::getDescription).toList());
        }
    }

    public record ItemDto(UUID serviceId, UUID addonId, String description, BigDecimal quantity,
                          long unitPriceHalalas, long totalHalalas) {
        static ItemDto of(BookingItem i) {
            return new ItemDto(i.getServiceId(), i.getAddonId(), i.getDescription(), i.getQuantity(),
                    i.getUnitPriceHalalas(), i.getTotalHalalas());
        }
    }

    public record EventDto(UUID id, VisitEvent.Type type, BookingStatus fromStatus, BookingStatus toStatus,
                           String note, String actorName, Instant at) {
        static EventDto of(VisitEvent e) {
            return new EventDto(e.getId(), e.getType(), e.getFromStatus(), e.getToStatus(), e.getNote(),
                    e.getActorName(), e.getCreatedAt());
        }
    }

    public record BookingDetail(UUID id, long number, BookingStatus status, BookingSource source,
                                Instant scheduledStart, Instant scheduledEnd, UUID customerId, String customerName,
                                String customerPhone, UUID addressId, String addressText, String navigationUrl,
                                String notes, String internalNotes, String cancelReason, Instant completedAt,
                                long subtotalHalalas, List<ItemDto> items, List<TechnicianRef> technicians,
                                List<EventDto> events, Set<BookingStatus> allowedTransitions, Instant createdAt,
                                Booking.InvoiceState invoiceState, String invoiceError, PaymentMethod paymentMethod,
                                String promoCode, long discountHalalas) {
        static BookingDetail of(BookingService.Detail d) {
            Booking b = d.booking();
            return new BookingDetail(b.getId(), b.getNumber(), b.getStatus(), b.getSource(), b.getScheduledStart(),
                    b.getScheduledEnd(), b.getCustomerId(), b.getCustomerName(), b.getCustomerPhone(),
                    b.getAddressId(), b.getAddressText(), b.navigationUrl(), b.getNotes(), b.getInternalNotes(),
                    b.getCancelReason(), b.getCompletedAt(), b.getSubtotalHalalas(),
                    b.getItems().stream().map(ItemDto::of).toList(),
                    d.assignments().stream().map(TechnicianRef::of).toList(),
                    d.events().stream().map(EventDto::of).toList(),
                    d.allowedTransitions(), b.getCreatedAt(), b.getInvoiceState(), b.getInvoiceError(),
                    b.getPaymentMethod(), b.getPromoCode(), b.getDiscountHalalas());
        }
    }

    public record PricePreview(List<ItemDto> items, long subtotalHalalas, int durationMin) {
        static PricePreview of(BookingPricing.Priced p) {
            return new PricePreview(p.items().stream().map(ItemDto::of).toList(), p.subtotalHalalas(), p.durationMin());
        }
    }
}
