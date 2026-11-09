package com.fieldops.app.inbox;

import com.fieldops.app.common.security.Screen;

/**
 * What a notification is about. Staff kinds go to owners and to coordinators who may open {@link #screen};
 * customer kinds go to the booking's (or invoice's) customer in the portal.
 */
public enum InboxKind {
    // Office
    BOOKING_NEW(Screen.BOOKINGS),
    BOOKING_CANCELLED_BY_CUSTOMER(Screen.BOOKINGS),
    VISIT_COMPLETED(Screen.BOOKINGS),
    CONTACT_NEW(Screen.CONTACT_REQUESTS),
    REVIEW_NEW(Screen.REVIEWS),
    // Customer
    BOOKING_CONFIRMED(null),
    TECHNICIAN_ASSIGNED(null),
    BOOKING_RESCHEDULED(null),
    BOOKING_CANCELLED(null),
    TECHNICIAN_ON_THE_WAY(null),
    VISIT_DONE(null),
    INVOICE_ISSUED(null);

    private final Screen screen;

    InboxKind(Screen screen) {
        this.screen = screen;
    }

    /** For office kinds: the screen a coordinator needs to receive it. Null for customer kinds. */
    public Screen screen() {
        return screen;
    }
}
