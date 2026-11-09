package com.fieldops.app.inbox;

import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingEvents;
import com.fieldops.app.booking.BookingRepository;
import com.fieldops.app.booking.BookingSource;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.scheduling.SchedulingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns booking events into in-app notifications. Runs inside the booking's transaction (BEFORE_COMMIT), so a
 * notification exists exactly when the change does; a problem here never rolls the change back.
 *
 * <p>Who made the change comes from the caller's token: a staff role in the admin app, none in the customer
 * portal (customers have no staff role).
 */
@Component
public class InboxBookingListener {

    private static final Logger log = LoggerFactory.getLogger(InboxBookingListener.class);

    private final InboxService inbox;
    private final BookingRepository bookings;
    private final SchedulingService scheduling;

    public InboxBookingListener(InboxService inbox, BookingRepository bookings, SchedulingService scheduling) {
        this.inbox = inbox;
        this.bookings = bookings;
        this.scheduling = scheduling;
    }

    private static String firstName(String full) {
        return full == null ? "" : full.trim().split("\\s+")[0];
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onCreated(BookingEvents.Created e) {
        run(e.bookingId(), b -> {
            if (e.source() != BookingSource.MANUAL) { // booked by the customer (portal or booking page)
                inbox.toStaff(InboxKind.BOOKING_NEW, b.getId(), null, b.getNumber(), b.getCustomerName(), null);
            }
        });
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onStatusChanged(BookingEvents.StatusChanged e) {
        Role by = CurrentUser.roleOrNull();
        run(e.bookingId(), b -> {
            switch (e.to()) {
                case CONFIRMED -> {
                    if (e.from() == BookingStatus.NEW) { // not when a technician is unassigned (ASSIGNED → CONFIRMED)
                        customer(b, InboxKind.BOOKING_CONFIRMED);
                    }
                }
                case ASSIGNED -> {
                    // Who is coming, by first name (assignments are written before this event in the same transaction).
                    String names = scheduling.forBooking(b.getId()).stream()
                            .map(a -> firstName(a.getTechnician().getUser().getName()))
                            .collect(Collectors.joining("، "));
                    inbox.toCustomer(b.getCustomerId(), InboxKind.TECHNICIAN_ASSIGNED, b.getId(), null, b.getNumber(),
                            names.isBlank() ? null : names);
                }
                case ON_THE_WAY -> customer(b, InboxKind.TECHNICIAN_ON_THE_WAY);
                case COMPLETED -> {
                    customer(b, InboxKind.VISIT_DONE);
                    if (by == Role.TECHNICIAN) {
                        inbox.toStaff(InboxKind.VISIT_COMPLETED, b.getId(), null, b.getNumber(), CurrentUser.nameOrNull(),
                                CurrentUser.idOrNull());
                    }
                }
                case CANCELLED -> {
                    if (by == null) {
                        inbox.toStaff(InboxKind.BOOKING_CANCELLED_BY_CUSTOMER, b.getId(), null, b.getNumber(),
                                b.getCustomerName(), null);
                    } else {
                        customer(b, InboxKind.BOOKING_CANCELLED);
                    }
                }
                default -> {
                    // IN_PROGRESS, NO_SHOW: internal steps
                }
            }
        });
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onRescheduled(BookingEvents.Rescheduled e) {
        run(e.bookingId(), b -> {
            if (b.getStatus() != BookingStatus.NEW) {
                customer(b, InboxKind.BOOKING_RESCHEDULED);
            }
        });
    }

    private void customer(Booking b, InboxKind kind) {
        inbox.toCustomer(b.getCustomerId(), kind, b.getId(), null, b.getNumber(), null);
    }

    private void run(UUID bookingId, Consumer<Booking> work) {
        try {
            bookings.findById(bookingId).ifPresent(work);
        } catch (RuntimeException ex) {
            log.error("Could not create in-app notification for booking {}", bookingId, ex);
        }
    }
}
