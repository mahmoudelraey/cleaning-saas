package com.fieldops.app.analytics;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import java.util.UUID;

import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.common.web.ApiException;

/**
 * Filters shared by every analytics query. Dates are inclusive days in the company's time zone.
 *
 * @param regionId  geo_regions.id of the visit address
 * @param cityId    geo_cities.id of the visit address
 * @param serviceId only bookings / revenue of this service
 * @param statuses  booking statuses (empty = all)
 * @param compare   which earlier period to compare with
 */
public record AnalyticsFilter(LocalDate from, LocalDate to, Integer regionId, Integer cityId, UUID serviceId,
                              Set<BookingStatus> statuses, Compare compare) {

    /** Longest range a dashboard can cover (three years and a day for leap years). */
    public static final int MAX_DAYS = 1100;

    public enum Compare {
        NONE, PREVIOUS, YEAR
    }

    public AnalyticsFilter {
        if (from == null || to == null || to.isBefore(from)) {
            throw ApiException.badRequest("invalid_range", "Choose a valid date range");
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_DAYS) {
            throw ApiException.badRequest("invalid_range", "The range can be at most three years");
        }
        statuses = statuses == null ? Set.of() : Set.copyOf(statuses);
        compare = compare == null ? Compare.PREVIOUS : compare;
    }

    public long days() {
        return ChronoUnit.DAYS.between(from, to) + 1;
    }

    /** Region, city or status narrow the data to part of the business: company-wide costs no longer apply. */
    public boolean narrowed() {
        return regionId != null || cityId != null || serviceId != null || !statuses.isEmpty();
    }

    public AnalyticsFilter withRange(LocalDate f, LocalDate t) {
        return new AnalyticsFilter(f, t, regionId, cityId, serviceId, statuses, compare);
    }

    public AnalyticsFilter withService(UUID service) {
        return new AnalyticsFilter(from, to, regionId, cityId, service, statuses, compare);
    }

    /** The period to compare with, or null. */
    public AnalyticsFilter previous() {
        return switch (compare) {
            case NONE -> null;
            case YEAR -> withRange(from.minusYears(1), to.minusYears(1));
            case PREVIOUS -> withRange(from.minusDays(days()), from.minusDays(1));
        };
    }
}
