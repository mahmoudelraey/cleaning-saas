package com.fieldops.app.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fieldops.app.scheduling.Assignment;
import com.fieldops.app.scheduling.SchedulingService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/scheduling")
@PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
public class CalendarController {

    private final CalendarService calendar;
    private final BookingService bookings;

    public CalendarController(CalendarService calendar, BookingService bookings) {
        this.calendar = calendar;
        this.bookings = bookings;
    }

    @GetMapping("/calendar")
    public CalendarDto calendar(@RequestParam Instant from, @RequestParam Instant to,
                                @RequestParam(defaultValue = "false") boolean includeCancelled) {
        return CalendarDto.of(calendar.calendar(from, to, includeCancelled));
    }

    @GetMapping("/availability")
    public List<SlotDto> availability(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                      @RequestParam int durationMin) {
        return calendar.availability(date, durationMin, bookings.zone(), false).stream().map(SlotDto::of).toList();
    }

    public record SlotDto(Instant start, Instant end, int capacity, List<UUID> freeTechnicianIds) {
        static SlotDto of(SchedulingService.Slot s) {
            return new SlotDto(s.start(), s.end(), s.capacity(), s.freeTechnicians());
        }
    }

    public record TechnicianLane(UUID id, String name, String color, boolean active) {
    }

    public record CalendarBooking(UUID id, long number, BookingStatus status, Instant start, Instant end,
                                  String customerName, String addressText, long subtotalHalalas,
                                  List<UUID> technicianIds) {
    }

    public record CalendarDto(List<TechnicianLane> technicians, List<CalendarBooking> bookings) {
        static CalendarDto of(CalendarService.Calendar c) {
            Map<UUID, List<Assignment>> a = c.assignments();
            return new CalendarDto(
                    c.technicians().stream()
                            .map(t -> new TechnicianLane(t.getId(), t.getUser().getName(), t.getColor(), t.isActive()))
                            .toList(),
                    c.bookings().stream()
                            .map(b -> new CalendarBooking(b.getId(), b.getNumber(), b.getStatus(), b.getScheduledStart(),
                                    b.getScheduledEnd(), b.getCustomerName(), b.getAddressText(), b.getSubtotalHalalas(),
                                    a.getOrDefault(b.getId(), List.of()).stream()
                                            .map(x -> x.getTechnician().getId()).toList()))
                            .toList());
        }
    }
}
