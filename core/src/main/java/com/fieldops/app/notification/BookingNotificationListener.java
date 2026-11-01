package com.fieldops.app.notification;

import java.util.List;
import java.util.stream.Collectors;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingEvents;
import com.fieldops.app.booking.BookingRepository;
import com.fieldops.app.booking.BookingSource;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.scheduling.SchedulingService;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns booking events into customer messages. Runs BEFORE_COMMIT, i.e. inside the booking's
 * transaction: the outbox row commits atomically with the change, or not at all.
 */
@Component
public class BookingNotificationListener {

    private static final Logger log = LoggerFactory.getLogger(BookingNotificationListener.class);

    private final NotificationService notifications;
    private final BookingRepository bookings;
    private final TenantRepository tenants;
    private final SchedulingService scheduling;

    public BookingNotificationListener(NotificationService notifications, BookingRepository bookings,
                                       TenantRepository tenants, SchedulingService scheduling) {
        this.notifications = notifications;
        this.bookings = bookings;
        this.tenants = tenants;
        this.scheduling = scheduling;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onCreated(BookingEvents.Created e) {
        try {
            Booking b = bookings.findById(e.bookingId()).orElse(null);
            Tenant t = tenants.findById(e.tenantId()).orElse(null);
            if (b == null || t == null || !t.isNotifyConfirmation()) {
                return;
            }
            if (e.source() != BookingSource.MANUAL) { // booking page or customer portal: "we got your request"
                send(b, NotificationTemplate.BOOKING_RECEIVED, notifications.bookingParams(b, t));
            } else if (b.getStatus() == BookingStatus.CONFIRMED || b.getStatus() == BookingStatus.ASSIGNED) {
                send(b, NotificationTemplate.BOOKING_CONFIRMED, notifications.bookingParams(b, t));
            }
        } catch (RuntimeException ex) {
            // Never let a messaging problem roll back the booking change itself.
            log.error("Could not enqueue notification for booking {}", e.bookingId(), ex);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onStatusChanged(BookingEvents.StatusChanged e) {
        try {
            Booking b = bookings.findById(e.bookingId()).orElse(null);
            Tenant t = tenants.findById(e.tenantId()).orElse(null);
            if (b == null || t == null) {
                return;
            }
            switch (e.to()) {
                case CONFIRMED -> {
                    // Only the first confirmation (NEW → CONFIRMED); unassigning (ASSIGNED → CONFIRMED) is internal.
                    if (e.from() == BookingStatus.NEW && t.isNotifyConfirmation()) {
                        send(b, NotificationTemplate.BOOKING_CONFIRMED, notifications.bookingParams(b, t));
                    }
                }
                case ON_THE_WAY -> {
                    if (t.isNotifyOnTheWay()) {
                        String techs = scheduling.forBooking(b.getId()).stream()
                                .map(a -> NotificationService.firstName(a.getTechnician().getUser().getName()))
                                .collect(Collectors.joining(" و"));
                        send(b, NotificationTemplate.TECHNICIAN_ON_THE_WAY, List.of(
                                NotificationService.firstName(b.getCustomerName()), techs, t.getName(),
                                String.valueOf(b.getNumber())));
                    }
                }
                case COMPLETED -> {
                    if (t.isNotifyCompleted()) {
                        send(b, NotificationTemplate.VISIT_COMPLETED, List.of(
                                NotificationService.firstName(b.getCustomerName()), t.getName(), String.valueOf(b.getNumber())));
                    }
                }
                case CANCELLED -> {
                    if (t.isNotifyCancelled()) {
                        send(b, NotificationTemplate.BOOKING_CANCELLED, List.of(
                                NotificationService.firstName(b.getCustomerName()), t.getName(), String.valueOf(b.getNumber())));
                    }
                }
                default -> {
                    // ASSIGNED, IN_PROGRESS, NO_SHOW: internal steps, no customer message
                }
            }
        } catch (RuntimeException ex) {
            // Never let a messaging problem roll back the booking change itself.
            log.error("Could not enqueue notification for booking {}", e.bookingId(), ex);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void onRescheduled(BookingEvents.Rescheduled e) {
        try {
            Booking b = bookings.findById(e.bookingId()).orElse(null);
            Tenant t = tenants.findById(e.tenantId()).orElse(null);
            if (b != null && t != null && t.isNotifyConfirmation() && b.getStatus() != BookingStatus.NEW) {
                send(b, NotificationTemplate.BOOKING_RESCHEDULED, notifications.bookingParams(b, t));
            }
        } catch (RuntimeException ex) {
            // Never let a messaging problem roll back the booking change itself.
            log.error("Could not enqueue notification for booking {}", e.bookingId(), ex);
        }
    }

    private void send(Booking b, NotificationTemplate template, List<String> params) {
        notifications.enqueue(b.getId(), template, b.getCustomerPhone(), params);
    }
}
