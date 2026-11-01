package com.fieldops.app.scheduling;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

/**
 * Work-hours rules in the company's local time zone.
 * A technician with no configured shifts is treated as "not restricted" for manual assignment,
 * and as working {@link #DEFAULT_START}–{@link #DEFAULT_END} when computing public availability.
 */
public final class WorkHours {

    public static final LocalTime DEFAULT_START = LocalTime.of(8, 0);
    public static final LocalTime DEFAULT_END = LocalTime.of(20, 0);

    private WorkHours() {
    }

    /** Does [start, end) fall completely inside one of the technician's shifts on that local day? */
    public static boolean covers(List<WorkShift> shifts, Instant start, Instant end, ZoneId zone) {
        if (shifts == null || shifts.isEmpty()) {
            return true;
        }
        ZonedDateTime s = start.atZone(zone);
        ZonedDateTime e = end.atZone(zone);
        LocalDate day = s.toLocalDate();
        LocalTime startTime = s.toLocalTime();
        LocalTime endTime;
        if (e.toLocalDate().equals(day)) {
            endTime = e.toLocalTime();
        } else if (e.toLocalDate().equals(day.plusDays(1)) && e.toLocalTime().equals(LocalTime.MIDNIGHT)) {
            endTime = LocalTime.MAX;
        } else {
            return false; // visits do not span midnight
        }
        for (WorkShift shift : shifts) {
            if (shift.day() != day.getDayOfWeek()) {
                continue;
            }
            LocalTime shiftEnd = shift.endTime();
            if (!startTime.isBefore(shift.startTime()) && !endTime.isAfter(shiftEnd)) {
                return true;
            }
        }
        return false;
    }

    /** Shifts for a given local date, falling back to the default day when none are configured. */
    public static List<WorkShift> shiftsOn(List<WorkShift> shifts, LocalDate date) {
        if (shifts == null || shifts.isEmpty()) {
            return List.of(new WorkShift(date.getDayOfWeek(), DEFAULT_START.toString(), DEFAULT_END.toString()));
        }
        return shifts.stream().filter(s -> s.day() == date.getDayOfWeek()).toList();
    }
}
