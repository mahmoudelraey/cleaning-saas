package com.fieldops.app.common.security;

import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Admin screens an owner can switch on or off for each coordinator (Team page). Owners see everything;
 * technicians have their own visit list. Enforced in the admin UI and by {@code ScreenAccessInterceptor}.
 */
public enum Screen {
    DASHBOARD, CALENDAR, BOOKINGS, MESSAGES, CONTACT_REQUESTS, REVIEWS,
    INVOICES, QUOTES, REPORTS, SALES, EXPENSES,
    CUSTOMERS, SERVICES, TECHNICIANS;

    /**
     * What a coordinator could open before screens were configurable: all but the business figures (reports,
     * sales, expenses), which an owner must allow explicitly. Payroll is never a coordinator screen.
     */
    public static final Set<Screen> DEFAULT = Collections.unmodifiableSet(
            EnumSet.complementOf(EnumSet.of(REPORTS, SALES, EXPENSES)));

    /** "BOOKINGS,CALENDAR" → set; null → {@link #DEFAULT}; unknown names are ignored. */
    public static Set<Screen> parse(String csv) {
        if (csv == null) {
            return DEFAULT;
        }
        EnumSet<Screen> out = EnumSet.noneOf(Screen.class);
        for (String s : csv.split(",")) {
            Arrays.stream(values()).filter(v -> v.name().equals(s.trim())).findFirst().ifPresent(out::add);
        }
        return Collections.unmodifiableSet(out);
    }

    public static String format(Collection<Screen> screens) {
        return screens.stream().sorted().map(Enum::name).collect(Collectors.joining(","));
    }
}
