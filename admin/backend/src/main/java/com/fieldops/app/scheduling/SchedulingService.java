package com.fieldops.app.scheduling;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.fieldops.app.common.web.ApiException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Technician assignment with conflict prevention (code check + DB exclusion constraint),
 * work-hours rules and availability slots.
 */
@Service
public class SchedulingService {

    public static final Duration SLOT_STEP = Duration.ofMinutes(30);

    private final AssignmentRepository assignments;
    private final TechnicianRepository technicians;

    public SchedulingService(AssignmentRepository assignments, TechnicianRepository technicians) {
        this.assignments = assignments;
        this.technicians = technicians;
    }

    /** An open start time. {@code freeTechnicians} is never sent to the public page, only the count. */
    public record Slot(Instant start, Instant end, List<UUID> freeTechnicians, int capacity) {
    }

    /**
     * Replaces the booking's assignments with the given technicians for [start, end).
     *
     * @param force owner/coordinator override for the work-hours rule (never for double booking)
     */
    @Transactional
    public List<Assignment> assign(UUID bookingId, Collection<UUID> technicianIds, Instant start, Instant end,
                                   ZoneId zone, boolean force) {
        Set<UUID> ids = new LinkedHashSet<>(technicianIds);
        if (ids.isEmpty()) {
            throw ApiException.badRequest("technicians_required", "Choose at least one technician");
        }
        List<Technician> chosen = technicians.findAllById(ids);
        if (chosen.size() != ids.size()) {
            throw ApiException.notFound("technician");
        }
        for (Technician t : chosen) {
            if (!t.isActive()) {
                throw ApiException.conflict("technician_inactive", t.getUser().getName() + " is not active");
            }
            if (!force && !WorkHours.covers(t.getWorkHours(), start, end, zone)) {
                throw new ApiException(HttpStatus.CONFLICT, "outside_work_hours",
                        t.getUser().getName() + " does not work at this time");
            }
        }
        assertNoConflicts(ids, start, end, bookingId);

        assignments.deleteByBooking(bookingId);
        List<Assignment> created = new ArrayList<>();
        for (Technician t : chosen) {
            created.add(new Assignment(bookingId, t, start, end));
        }
        try {
            return assignments.saveAllAndFlush(created);
        } catch (DataIntegrityViolationException race) {
            // Another coordinator booked the same technician in the meantime; the DB constraint caught it.
            throw ApiException.conflict("technician_busy", "A technician was just booked for this time");
        }
    }

    /** Moves existing assignments to a new window, re-checking conflicts and work hours. */
    @Transactional
    public void reschedule(UUID bookingId, Instant start, Instant end, ZoneId zone, boolean force) {
        List<Assignment> current = assignments.findByBooking(bookingId);
        if (current.isEmpty()) {
            return;
        }
        Set<UUID> ids = current.stream().map(a -> a.getTechnician().getId()).collect(Collectors.toSet());
        for (Assignment a : current) {
            if (!force && !WorkHours.covers(a.getTechnician().getWorkHours(), start, end, zone)) {
                throw new ApiException(HttpStatus.CONFLICT, "outside_work_hours",
                        a.getTechnician().getUser().getName() + " does not work at this time");
            }
        }
        assertNoConflicts(ids, start, end, bookingId);
        current.forEach(a -> a.moveTo(start, end));
        try {
            assignments.flush();
        } catch (DataIntegrityViolationException race) {
            throw ApiException.conflict("technician_busy", "A technician was just booked for this time");
        }
    }

    @Transactional
    public void release(UUID bookingId) {
        assignments.deleteByBooking(bookingId);
    }

    @Transactional(readOnly = true)
    public List<Assignment> forBooking(UUID bookingId) {
        return assignments.findByBooking(bookingId);
    }

    @Transactional(readOnly = true)
    public Map<UUID, List<Assignment>> forBookings(Collection<UUID> bookingIds) {
        if (bookingIds.isEmpty()) {
            return Map.of();
        }
        return assignments.findByBookings(bookingIds).stream()
                .collect(Collectors.groupingBy(Assignment::getBookingId));
    }

    @Transactional(readOnly = true)
    public boolean isAssigned(UUID bookingId, UUID technicianId) {
        return assignments.existsByBookingIdAndTechnicianId(bookingId, technicianId);
    }

    /**
     * Start times on a local date where at least one active technician is free for {@code durationMin}
     * within their shift, after subtracting unassigned bookings that already overlap (they will need a
     * technician too, so they consume capacity).
     *
     * @param unassignedWindows time windows of NEW/CONFIRMED bookings without a technician yet
     */
    @Transactional(readOnly = true)
    public List<Slot> availability(LocalDate date, int durationMin, ZoneId zone, Instant notBefore,
                                   List<Instant[]> unassignedWindows) {
        Duration duration = Duration.ofMinutes(durationMin);
        Instant dayStart = date.atStartOfDay(zone).toInstant();
        Instant dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant();

        List<Technician> active = technicians.findAllWithUser().stream().filter(Technician::isActive).toList();
        Map<UUID, List<Assignment>> busy = new HashMap<>();
        for (Assignment a : assignments.findInRange(dayStart, dayEnd)) {
            busy.computeIfAbsent(a.getTechnician().getId(), k -> new ArrayList<>()).add(a);
        }

        List<Slot> slots = new ArrayList<>();
        for (Instant start = dayStart; !start.plus(duration).isAfter(dayEnd); start = start.plus(SLOT_STEP)) {
            Instant end = start.plus(duration);
            if (start.isBefore(notBefore)) {
                continue;
            }
            List<UUID> free = new ArrayList<>();
            for (Technician t : active) {
                if (!withinShiftsOn(t, date, start, end, zone)) {
                    continue;
                }
                final Instant s = start;
                boolean overlaps = busy.getOrDefault(t.getId(), List.of()).stream()
                        .anyMatch(a -> a.getStartsAt().isBefore(end) && a.getEndsAt().isAfter(s));
                if (!overlaps) {
                    free.add(t.getId());
                }
            }
            final Instant s = start;
            long pending = unassignedWindows.stream()
                    .filter(w -> w[0].isBefore(end) && w[1].isAfter(s))
                    .count();
            int capacity = (int) Math.max(0, free.size() - pending);
            if (capacity > 0) {
                slots.add(new Slot(start, end, free, capacity));
            }
        }
        return slots;
    }

    private static boolean withinShiftsOn(Technician t, LocalDate date, Instant start, Instant end, ZoneId zone) {
        ZonedDateTime s = start.atZone(zone);
        ZonedDateTime e = end.atZone(zone);
        if (!s.toLocalDate().equals(date) || !e.toLocalDate().equals(date)) {
            return false;
        }
        for (WorkShift shift : WorkHours.shiftsOn(t.getWorkHours(), date)) {
            if (!s.toLocalTime().isBefore(shift.startTime()) && !e.toLocalTime().isAfter(shift.endTime())) {
                return true;
            }
        }
        return false;
    }

    private void assertNoConflicts(Set<UUID> technicianIds, Instant start, Instant end, UUID bookingId) {
        List<Assignment> conflicts = assignments.findConflicts(technicianIds, start, end, bookingId);
        if (!conflicts.isEmpty()) {
            String names = conflicts.stream().map(a -> a.getTechnician().getUser().getName())
                    .distinct().collect(Collectors.joining("، "));
            throw ApiException.conflict("technician_busy", names + " already has a visit at this time");
        }
    }
}
