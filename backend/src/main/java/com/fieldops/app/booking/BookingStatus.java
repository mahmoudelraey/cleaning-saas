package com.fieldops.app.booking;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

import com.fieldops.app.common.security.Role;

/**
 * Booking lifecycle (plan section 5.4) as an explicit state machine. Every transition not listed
 * here is rejected, and the technician app may only drive the field steps.
 */
public enum BookingStatus {
    NEW,
    CONFIRMED,
    ASSIGNED,
    ON_THE_WAY,
    IN_PROGRESS,
    COMPLETED,
    CANCELLED,
    NO_SHOW;

    private static final Map<BookingStatus, Set<BookingStatus>> ALLOWED = Map.of(
            NEW, EnumSet.of(CONFIRMED, CANCELLED),
            CONFIRMED, EnumSet.of(ASSIGNED, CANCELLED),
            ASSIGNED, EnumSet.of(ON_THE_WAY, CONFIRMED, CANCELLED),
            ON_THE_WAY, EnumSet.of(IN_PROGRESS, NO_SHOW),
            IN_PROGRESS, EnumSet.of(COMPLETED),
            COMPLETED, EnumSet.noneOf(BookingStatus.class),
            CANCELLED, EnumSet.noneOf(BookingStatus.class),
            NO_SHOW, EnumSet.noneOf(BookingStatus.class));

    /** Steps a technician performs from the field. Everything else is office work. */
    private static final Set<BookingStatus> FIELD_STEPS = EnumSet.of(ON_THE_WAY, IN_PROGRESS, COMPLETED, NO_SHOW);

    public Set<BookingStatus> next() {
        return Collections.unmodifiableSet(ALLOWED.get(this));
    }

    public boolean canMoveTo(BookingStatus target) {
        return ALLOWED.get(this).contains(target);
    }

    public boolean isTerminal() {
        return ALLOWED.get(this).isEmpty();
    }

    /** Booking details (items, time, customer) can only change before the visit starts. */
    public boolean isEditable() {
        return this == NEW || this == CONFIRMED || this == ASSIGNED;
    }

    /**
     * Which targets a role may request directly through the status endpoint. ASSIGNED is excluded for
     * everyone: it is reached only through the assign endpoint, which checks technician availability.
     */
    public Set<BookingStatus> nextFor(Role role) {
        Set<BookingStatus> result = EnumSet.noneOf(BookingStatus.class);
        for (BookingStatus target : ALLOWED.get(this)) {
            if (target == ASSIGNED) {
                continue;
            }
            if (role == Role.TECHNICIAN && !FIELD_STEPS.contains(target)) {
                continue;
            }
            result.add(target);
        }
        return result;
    }
}
