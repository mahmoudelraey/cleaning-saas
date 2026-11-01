package com.fieldops.app.booking;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.scheduling.Assignment;
import com.fieldops.app.scheduling.SchedulingService;
import com.fieldops.app.scheduling.Technician;
import com.fieldops.app.scheduling.TechnicianRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read models for the dispatch calendar and for open time slots (office and public booking page). */
@Service
public class CalendarService {

    /** Statuses that occupy time on the calendar. */
    static final Set<BookingStatus> ACTIVE = EnumSet.of(BookingStatus.NEW, BookingStatus.CONFIRMED,
            BookingStatus.ASSIGNED, BookingStatus.ON_THE_WAY, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED);

    private static final Set<BookingStatus> NEEDS_TECHNICIAN = EnumSet.of(BookingStatus.NEW, BookingStatus.CONFIRMED);

    /** Minimum notice for bookings from the public page. */
    public static final Duration PUBLIC_LEAD_TIME = Duration.ofHours(2);

    private final BookingRepository bookings;
    private final TechnicianRepository technicians;
    private final SchedulingService scheduling;
    private final Clock clock;

    public CalendarService(BookingRepository bookings, TechnicianRepository technicians,
                           SchedulingService scheduling, Clock clock) {
        this.bookings = bookings;
        this.technicians = technicians;
        this.scheduling = scheduling;
        this.clock = clock;
    }

    public record Calendar(List<Technician> technicians, List<Booking> bookings,
                           Map<UUID, List<Assignment>> assignments) {
    }

    @Transactional(readOnly = true)
    public Calendar calendar(Instant from, Instant to, boolean includeCancelled) {
        if (!to.isAfter(from) || Duration.between(from, to).toDays() > 42) {
            throw ApiException.badRequest("invalid_range", "Range must be between 1 minute and 6 weeks");
        }
        Set<BookingStatus> statuses = EnumSet.copyOf(ACTIVE);
        if (includeCancelled) {
            statuses.add(BookingStatus.CANCELLED);
            statuses.add(BookingStatus.NO_SHOW);
        }
        List<Booking> found = bookings.findOverlapping(from, to, statuses);
        Map<UUID, List<Assignment>> assigned = scheduling.forBookings(found.stream().map(Booking::getId).toList());
        List<Technician> techs = technicians.findAllWithUser();
        return new Calendar(techs, found, assigned);
    }

    /**
     * Open start times on a local date for a visit of {@code durationMin}.
     *
     * @param publicPage applies the minimum notice period and is used by the booking page
     */
    @Transactional(readOnly = true)
    public List<SchedulingService.Slot> availability(LocalDate date, int durationMin, ZoneId zone, boolean publicPage) {
        if (durationMin < 15 || durationMin > 24 * 60) {
            throw ApiException.badRequest("invalid_duration", "Duration must be between 15 minutes and 24 hours");
        }
        Instant now = Instant.now(clock);
        Instant notBefore = publicPage ? now.plus(PUBLIC_LEAD_TIME) : now;
        Instant dayStart = date.atStartOfDay(zone).toInstant();
        Instant dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant();

        List<Booking> pending = bookings.findOverlapping(dayStart, dayEnd, NEEDS_TECHNICIAN);
        List<Instant[]> windows = pending.stream()
                .map(b -> new Instant[] {b.getScheduledStart(), b.getScheduledEnd()})
                .toList();
        return scheduling.availability(date, durationMin, zone, notBefore, windows);
    }
}
