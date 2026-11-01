package com.fieldops.app.booking;

import java.util.UUID;

/**
 * Domain events published by {@link BookingService}. Listeners (notifications, reports) use
 * {@code @TransactionalEventListener} so they only react to committed changes.
 */
public final class BookingEvents {

    private BookingEvents() {
    }

    public record Created(UUID tenantId, UUID bookingId, BookingSource source) {
    }

    public record StatusChanged(UUID tenantId, UUID bookingId, BookingStatus from, BookingStatus to) {
    }

    public record Rescheduled(UUID tenantId, UUID bookingId) {
    }
}
