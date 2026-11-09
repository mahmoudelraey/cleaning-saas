package com.fieldops.app.booking;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;

import com.fieldops.app.common.persistence.TenantCounterService;
import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.customer.Address;
import com.fieldops.app.customer.Customer;
import com.fieldops.app.customer.CustomerService;
import com.fieldops.app.scheduling.Assignment;
import com.fieldops.app.scheduling.SchedulingService;
import com.fieldops.app.scheduling.Technician;
import com.fieldops.app.scheduling.TechnicianRepository;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.TenantService;
import org.hibernate.Hibernate;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookingService {

    private final BookingRepository bookings;
    private final VisitEventRepository events;
    private final BookingPricing pricing;
    private final CustomerService customers;
    private final SchedulingService scheduling;
    private final TechnicianRepository technicians;
    private final TenantService tenants;
    private final TenantCounterService counters;
    private final ApplicationEventPublisher publisher;
    private final Clock clock;

    public BookingService(BookingRepository bookings, VisitEventRepository events, BookingPricing pricing,
                          CustomerService customers, SchedulingService scheduling, TechnicianRepository technicians,
                          TenantService tenants, TenantCounterService counters, ApplicationEventPublisher publisher,
                          Clock clock) {
        this.bookings = bookings;
        this.events = events;
        this.pricing = pricing;
        this.customers = customers;
        this.scheduling = scheduling;
        this.technicians = technicians;
        this.tenants = tenants;
        this.counters = counters;
        this.publisher = publisher;
        this.clock = clock;
    }

    /** What the office (or the public page) asks for. Prices are never accepted from the client. */
    public record BookingCommand(UUID customerId, UUID addressId, Instant scheduledStart, Integer durationMin,
                                 List<BookingPricing.Line> lines, String notes, String internalNotes,
                                 PaymentMethod paymentMethod) {
    }

    public record Filter(Set<BookingStatus> statuses, Instant from, Instant to, UUID customerId, UUID technicianId,
                         String q) {
    }

    public record Detail(Booking booking, List<Assignment> assignments, List<VisitEvent> events,
                         Set<BookingStatus> allowedTransitions) {
    }

    // --- Queries ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Page<Booking> search(Filter f, Pageable pageable) {
        Specification<Booking> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (f.statuses() != null && !f.statuses().isEmpty()) {
                p.add(root.get("status").in(f.statuses()));
            }
            if (f.from() != null) {
                p.add(cb.greaterThanOrEqualTo(root.<Instant>get("scheduledStart"), f.from()));
            }
            if (f.to() != null) {
                p.add(cb.lessThan(root.<Instant>get("scheduledStart"), f.to()));
            }
            if (f.customerId() != null) {
                p.add(cb.equal(root.get("customerId"), f.customerId()));
            }
            if (f.technicianId() != null) {
                Subquery<UUID> sq = query.subquery(UUID.class);
                var a = sq.from(Assignment.class);
                sq.select(a.<UUID>get("bookingId")).where(cb.equal(a.get("technician").get("id"), f.technicianId()));
                p.add(root.get("id").in(sq));
            }
            if (f.q() != null && !f.q().isBlank()) {
                String like = "%" + f.q().trim().toLowerCase() + "%";
                List<Predicate> any = new ArrayList<>();
                // Name or phone of the booking's customer (archived customers included).
                Subquery<UUID> byCustomer = query.subquery(UUID.class);
                var c = byCustomer.from(CustomerRef.class);
                byCustomer.select(c.<UUID>get("id")).where(cb.or(
                        cb.like(cb.lower(c.<String>get("name")), like),
                        cb.like(c.<String>get("phone"), like)));
                any.add(root.<UUID>get("customerId").in(byCustomer));
                String digits = f.q().replaceAll("\\D", "");
                if (!digits.isEmpty() && digits.length() <= 12) {
                    any.add(cb.equal(root.get("number"), Long.parseLong(digits)));
                }
                p.add(cb.or(any.toArray(Predicate[]::new)));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        Page<Booking> page = bookings.findAll(spec, pageable);
        // Lists show the service names; load the items here (open-in-view is off). Batched by @BatchSize.
        page.getContent().forEach(b -> Hibernate.initialize(b.getItems()));
        return page;
    }

    @Transactional(readOnly = true)
    public Booking get(UUID id) {
        return bookings.findWithItems(id).orElseThrow(() -> ApiException.notFound("booking"));
    }

    @Transactional(readOnly = true)
    public Detail detail(UUID id) {
        Booking b = get(id);
        Role role = CurrentUser.roleOrNull();
        if (role == Role.TECHNICIAN) {
            assertAssignedToCurrentTechnician(b.getId());
        }
        List<Assignment> assigned = scheduling.forBooking(id);
        assigned.forEach(a -> a.getTechnician().getUser().getName()); // initialise for the DTO
        Set<BookingStatus> allowed = role == null ? Set.of() : b.getStatus().nextFor(role);
        return new Detail(b, assigned, events.findByBookingIdOrderByCreatedAtAsc(id), allowed);
    }

    @Transactional(readOnly = true)
    public BookingPricing.Priced preview(List<BookingPricing.Line> lines) {
        return pricing.price(lines);
    }

    // --- Commands --------------------------------------------------------------------------------------

    @Transactional
    public Booking create(BookingCommand cmd, BookingSource source, List<UUID> technicianIds, boolean force) {
        Customer customer = customers.get(cmd.customerId());
        BookingPricing.Priced priced = pricing.price(cmd.lines());

        BookingStatus initial = source == BookingSource.MANUAL ? BookingStatus.CONFIRMED : BookingStatus.NEW;
        Booking b = new Booking(counters.next(TenantCounterService.BOOKING), source, initial);
        b.setCustomer(customer.getId(), customer.getName(), customer.getPhone());
        applyAddress(b, customer, cmd.addressId());
        Instant start = requireFuture(cmd.scheduledStart(), source);
        b.schedule(start, start.plus(Duration.ofMinutes(durationOf(cmd, priced))));
        b.setNotes(trim(cmd.notes()), trim(cmd.internalNotes()));
        b.setPaymentMethod(cmd.paymentMethod());
        b.replaceItems(priced.items());
        bookings.saveAndFlush(b);

        log(b.getId(), VisitEvent.Type.CREATED, null, initial,
                source == BookingSource.PUBLIC_PAGE ? "booking_page" : source == BookingSource.PORTAL ? "portal" : null);
        publisher.publishEvent(new BookingEvents.Created(TenantContext.require(), b.getId(), source));

        if (technicianIds != null && !technicianIds.isEmpty()) {
            assign(b.getId(), technicianIds, force);
        }
        return b;
    }

    @Transactional
    public Booking update(UUID id, BookingCommand cmd, boolean force) {
        Booking b = get(id);
        b.assertEditable();
        Customer customer = customers.get(cmd.customerId());
        BookingPricing.Priced priced = pricing.price(cmd.lines());

        b.setCustomer(customer.getId(), customer.getName(), customer.getPhone());
        applyAddress(b, customer, cmd.addressId());
        b.setNotes(trim(cmd.notes()), trim(cmd.internalNotes()));
        b.setPaymentMethod(cmd.paymentMethod());
        b.replaceItems(priced.items());

        Instant start = cmd.scheduledStart();
        Instant end = start.plus(Duration.ofMinutes(durationOf(cmd, priced)));
        boolean moved = !start.equals(b.getScheduledStart()) || !end.equals(b.getScheduledEnd());
        if (moved) {
            requireFuture(start, BookingSource.MANUAL);
            b.schedule(start, end);
            scheduling.reschedule(b.getId(), start, end, zone(), force);
            log(b.getId(), VisitEvent.Type.RESCHEDULED, null, null, null);
            publisher.publishEvent(new BookingEvents.Rescheduled(TenantContext.require(), b.getId()));
        } else {
            log(b.getId(), VisitEvent.Type.UPDATED, null, null, null);
        }
        return b;
    }

    @Transactional
    public Booking changeStatus(UUID id, BookingStatus target, String reason) {
        Booking b = get(id);
        Role role = CurrentUser.role();
        if (role == Role.TECHNICIAN) {
            assertAssignedToCurrentTechnician(b.getId());
        }
        if (!b.getStatus().nextFor(role).contains(target)) {
            throw ApiException.conflict("invalid_transition",
                    "Cannot move booking from " + b.getStatus() + " to " + target);
        }
        BookingStatus from = b.transitionTo(target, Instant.now(clock));
        if (target == BookingStatus.CANCELLED || (from == BookingStatus.ASSIGNED && target == BookingStatus.CONFIRMED)) {
            scheduling.release(b.getId()); // frees the technician's time
        }
        if (target == BookingStatus.CANCELLED) {
            b.setCancelReason(trim(reason));
        }
        if (target == BookingStatus.COMPLETED && tenants.current().isAutoInvoice()
                && tenants.hasFeature(tenants.current(), PlanFeature.QUOTES_INVOICES)) {
            b.requestInvoice(Instant.now(clock));
        }
        log(b.getId(), VisitEvent.Type.STATUS_CHANGED, from, target, trim(reason));
        publisher.publishEvent(new BookingEvents.StatusChanged(TenantContext.require(), b.getId(), from, target));
        return b;
    }

    /**
     * The customer cancels from the portal. Only their own booking, only before the visit is under way,
     * and only with enough notice; otherwise they must call the company.
     */
    @Transactional
    public Booking cancelByCustomer(UUID id, UUID customerId, String reason, Duration minNotice) {
        Booking b = get(id);
        if (!b.getCustomerId().equals(customerId)) {
            throw ApiException.notFound("booking");
        }
        if (!EnumSet.of(BookingStatus.NEW, BookingStatus.CONFIRMED, BookingStatus.ASSIGNED).contains(b.getStatus())) {
            throw ApiException.conflict("cannot_cancel", "This booking can no longer be cancelled");
        }
        Instant now = Instant.now(clock);
        if (b.getScheduledStart().isBefore(now.plus(minNotice))) {
            throw ApiException.conflict("too_late_to_cancel", "It's too close to the visit to cancel online. Call the company");
        }
        BookingStatus from = b.transitionTo(BookingStatus.CANCELLED, now);
        scheduling.release(b.getId());
        b.setCancelReason(trim(reason));
        events.save(new VisitEvent(b.getId(), VisitEvent.Type.STATUS_CHANGED, from, BookingStatus.CANCELLED,
                trim(reason), b.getCustomerName()));
        publisher.publishEvent(new BookingEvents.StatusChanged(TenantContext.require(), b.getId(), from,
                BookingStatus.CANCELLED));
        return b;
    }

    /** Assigns (or reassigns) technicians. A NEW booking is confirmed on the way. */
    @Transactional
    public Booking assign(UUID id, List<UUID> technicianIds, boolean force) {
        Booking b = get(id);
        if (!EnumSet.of(BookingStatus.NEW, BookingStatus.CONFIRMED, BookingStatus.ASSIGNED).contains(b.getStatus())) {
            throw ApiException.conflict("invalid_transition", "Technicians can only be assigned before the visit starts");
        }
        List<Assignment> created = scheduling.assign(b.getId(), technicianIds, b.getScheduledStart(),
                b.getScheduledEnd(), zone(), force);
        String names = created.stream().map(a -> a.getTechnician().getUser().getName()).collect(Collectors.joining("، "));

        Instant now = Instant.now(clock);
        if (b.getStatus() == BookingStatus.NEW) {
            b.transitionTo(BookingStatus.CONFIRMED, now);
            log(b.getId(), VisitEvent.Type.STATUS_CHANGED, BookingStatus.NEW, BookingStatus.CONFIRMED, null);
            publisher.publishEvent(new BookingEvents.StatusChanged(TenantContext.require(), b.getId(),
                    BookingStatus.NEW, BookingStatus.CONFIRMED));
        }
        if (b.getStatus() == BookingStatus.CONFIRMED) {
            b.transitionTo(BookingStatus.ASSIGNED, now);
            log(b.getId(), VisitEvent.Type.STATUS_CHANGED, BookingStatus.CONFIRMED, BookingStatus.ASSIGNED, null);
            publisher.publishEvent(new BookingEvents.StatusChanged(TenantContext.require(), b.getId(),
                    BookingStatus.CONFIRMED, BookingStatus.ASSIGNED));
        }
        log(b.getId(), VisitEvent.Type.ASSIGNED, null, null, names);
        return b;
    }

    @Transactional
    public Booking unassign(UUID id) {
        Booking b = get(id);
        if (b.getStatus() != BookingStatus.ASSIGNED) {
            throw ApiException.conflict("invalid_transition", "Booking has no assigned technician");
        }
        scheduling.release(b.getId());
        b.transitionTo(BookingStatus.CONFIRMED, Instant.now(clock));
        log(b.getId(), VisitEvent.Type.UNASSIGNED, BookingStatus.ASSIGNED, BookingStatus.CONFIRMED, null);
        publisher.publishEvent(new BookingEvents.StatusChanged(TenantContext.require(), b.getId(),
                BookingStatus.ASSIGNED, BookingStatus.CONFIRMED));
        return b;
    }

    @Transactional
    public VisitEvent addNote(UUID id, String note) {
        Booking b = get(id);
        if (CurrentUser.roleOrNull() == Role.TECHNICIAN) {
            assertAssignedToCurrentTechnician(b.getId());
        }
        return log(b.getId(), VisitEvent.Type.NOTE, null, null, trim(note));
    }

    /** Used by other modules (field photos) to append to the timeline. */
    @Transactional
    public VisitEvent log(UUID bookingId, VisitEvent.Type type, BookingStatus from, BookingStatus to, String note) {
        String actor = CurrentUser.nameOrNull();
        return events.save(new VisitEvent(bookingId, type, from, to, note, actor));
    }

    // --- Helpers ---------------------------------------------------------------------------------------

    public void assertAssignedToCurrentTechnician(UUID bookingId) {
        Technician me = technicians.findByUserId(CurrentUser.id())
                .orElseThrow(() -> ApiException.forbidden("forbidden", "Not a technician"));
        if (!scheduling.isAssigned(bookingId, me.getId())) {
            // Same answer as "does not exist", so technicians cannot probe other visits.
            throw ApiException.notFound("booking");
        }
    }

    public ZoneId zone() {
        return ZoneId.of(tenants.current().getTimezone());
    }

    private static int durationOf(BookingCommand cmd, BookingPricing.Priced priced) {
        int minutes = cmd.durationMin() != null ? cmd.durationMin() : priced.durationMin();
        if (minutes < 15 || minutes > 24 * 60) {
            throw ApiException.badRequest("invalid_duration", "Duration must be between 15 minutes and 24 hours");
        }
        return minutes;
    }

    private Instant requireFuture(Instant start, BookingSource source) {
        if (start == null) {
            throw ApiException.badRequest("schedule_required", "Choose a date and time");
        }
        // The office may log a visit that started a little earlier today; the public page may not book the past.
        Duration grace = source == BookingSource.MANUAL ? Duration.ofHours(12) : Duration.ZERO;
        if (start.isBefore(Instant.now(clock).minus(grace))) {
            throw ApiException.badRequest("schedule_in_past", "The selected time is in the past");
        }
        return start;
    }

    private static void applyAddress(Booking b, Customer customer, UUID addressId) {
        if (addressId == null) {
            b.setAddress(null, null, null, null, null);
            return;
        }
        Address a = customer.getAddresses().stream()
                .filter(x -> x.getId().equals(addressId))
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("address"));
        b.setAddress(a.getId(), AddressRef.text(a.getLabel(), a.getCity(), a.getDistrict(), a.getDetails()), a.getLat(),
                a.getLng(), a.getMapUrl());
    }

    private static String trim(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
