package com.fieldops.app.scheduling;

import java.time.DayOfWeek;
import java.time.LocalTime;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * One working window in the company's local time, e.g. SUNDAY 08:00-17:00. Times are "HH:mm" strings
 * so the JSONB column stays human-readable and timezone-free.
 */
public record WorkShift(
        @NotNull DayOfWeek day,
        @NotNull @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$") String start,
        @NotNull @Pattern(regexp = "^([01]\\d|2[0-3]):[0-5]\\d$") String end) {

    public LocalTime startTime() {
        return LocalTime.parse(start);
    }

    public LocalTime endTime() {
        return LocalTime.parse(end);
    }
}
