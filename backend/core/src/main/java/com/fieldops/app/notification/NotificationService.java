package com.fieldops.app.notification;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingRepository;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Writes outbox rows; {@link NotificationDispatcher} does the actual sending. */
@Service
public class NotificationService {

    private static final Locale ARABIC = Locale.forLanguageTag("ar");
    // Gregorian dates, Latin digits (java.time uses ASCII digits unless a DecimalStyle is set).
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("EEEE d MMMM", ARABIC);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("h:mm a", ARABIC);

    public static final int CUSTOM_MESSAGE_MAX = 500;

    private final NotificationRepository notifications;
    private final BookingRepository bookings;
    private final TenantService tenants;
    private final Clock clock;

    public NotificationService(NotificationRepository notifications, BookingRepository bookings, TenantService tenants,
                               Clock clock) {
        this.notifications = notifications;
        this.bookings = bookings;
        this.tenants = tenants;
        this.clock = clock;
    }

    /**
     * A message the office writes to the booking's customer. Goes through the outbox like every other
     * message (same channels, same delivery tracking, counts toward the Basic plan's monthly cap).
     */
    @Transactional
    public Notification sendCustom(UUID bookingId, String message) {
        String text = message == null ? "" : message.trim().replaceAll("\\s*\\R\\s*", " ");
        if (text.isEmpty() || text.length() > CUSTOM_MESSAGE_MAX) {
            throw ApiException.badRequest("message_invalid", "Write a message of 1-" + CUSTOM_MESSAGE_MAX + " characters");
        }
        Booking b = bookings.findById(bookingId).orElseThrow(() -> ApiException.notFound("booking"));
        Tenant t = tenants.current();
        return enqueue(b.getId(), NotificationTemplate.CUSTOM_MESSAGE, b.getCustomerPhone(),
                List.of(firstName(b.getCustomerName()), t.getName(), text));
    }

    /** Must run inside the caller's transaction so the message is committed together with the change. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Notification enqueue(UUID bookingId, NotificationTemplate template, String toPhone, List<String> params) {
        return notifications.save(new Notification(bookingId, template, toPhone, params, Instant.now(clock)));
    }

    /** Standard parameters for booking messages: customer, company, date, time, number. */
    public List<String> bookingParams(Booking b, Tenant tenant) {
        ZoneId zone = ZoneId.of(tenant.getTimezone());
        return List.of(
                firstName(b.getCustomerName()),
                tenant.getName(),
                DATE.format(b.getScheduledStart().atZone(zone)),
                TIME.format(b.getScheduledStart().atZone(zone)),
                String.valueOf(b.getNumber()));
    }

    @Transactional(readOnly = true)
    public Page<Notification> list(UUID bookingId, Pageable pageable) {
        return bookingId == null
                ? notifications.findAllByOrderByCreatedAtDesc(pageable)
                : notifications.findByBookingIdOrderByCreatedAtDesc(bookingId, pageable);
    }

    static String firstName(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return "";
        }
        return fullName.trim().split("\\s+")[0];
    }
}
