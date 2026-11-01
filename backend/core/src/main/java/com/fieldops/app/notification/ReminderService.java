package com.fieldops.app.notification;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingRepository;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Queues a reminder {@code reminderHours} before each confirmed visit. Bookings made inside that
 * window are skipped (the customer just got a confirmation). A unique index makes it idempotent.
 */
@Component
public class ReminderService {

    private static final Logger log = LoggerFactory.getLogger(ReminderService.class);

    private final TenantRepository tenants;
    private final BookingRepository bookings;
    private final NotificationRepository notificationRepo;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final Clock clock;

    public ReminderService(TenantRepository tenants, BookingRepository bookings, NotificationRepository notificationRepo,
                           NotificationService notifications, TransactionTemplate tx, Clock clock) {
        this.tenants = tenants;
        this.bookings = bookings;
        this.notificationRepo = notificationRepo;
        this.notifications = notifications;
        this.tx = tx;
        this.clock = clock;
    }

    public int queueDueReminders() {
        int queued = 0;
        Instant now = Instant.now(clock);
        for (Tenant t : tenants.findAll()) {
            if (t.isUsable(now) && t.isNotifyReminder()) {
                queued += queueForTenant(t, now);
            }
        }
        return queued;
    }

    int queueForTenant(Tenant tenant, Instant now) {
        Duration lead = Duration.ofHours(tenant.getReminderHours());
        return TenantContext.runAs(tenant.getId(), () -> {
            List<Booking> due = tx.execute(s -> bookings.findStartingBetween(now, now.plus(lead),
                    EnumSet.of(BookingStatus.CONFIRMED, BookingStatus.ASSIGNED)));
            int queued = 0;
            for (Booking b : due == null ? List.<Booking>of() : due) {
                if (b.getCreatedAt().isAfter(b.getScheduledStart().minus(lead))) {
                    continue;
                }
                try {
                    Boolean done = tx.execute(s -> {
                        if (notificationRepo.existsByBookingIdAndTemplate(b.getId(), NotificationTemplate.BOOKING_REMINDER)) {
                            return false;
                        }
                        notifications.enqueue(b.getId(), NotificationTemplate.BOOKING_REMINDER, b.getCustomerPhone(),
                                notifications.bookingParams(b, tenant));
                        return true;
                    });
                    if (Boolean.TRUE.equals(done)) {
                        queued++;
                    }
                } catch (DataIntegrityViolationException duplicate) {
                    log.debug("Reminder for booking {} already queued", b.getId());
                }
            }
            return queued;
        });
    }
}
