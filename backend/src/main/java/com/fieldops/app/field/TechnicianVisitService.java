package com.fieldops.app.field;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingRepository;
import com.fieldops.app.booking.BookingService;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.scheduling.Assignment;
import com.fieldops.app.scheduling.AssignmentRepository;
import com.fieldops.app.scheduling.Technician;
import com.fieldops.app.scheduling.TechnicianRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** "My visits" for the technician PWA. */
@Service
public class TechnicianVisitService {

    private final TechnicianRepository technicians;
    private final AssignmentRepository assignments;
    private final BookingRepository bookingRepo;
    private final BookingService bookings;
    private final MediaRepository media;

    public TechnicianVisitService(TechnicianRepository technicians, AssignmentRepository assignments,
                                  BookingRepository bookingRepo, BookingService bookings, MediaRepository media) {
        this.technicians = technicians;
        this.assignments = assignments;
        this.bookingRepo = bookingRepo;
        this.bookings = bookings;
        this.media = media;
    }

    public record Visit(Booking booking, long photoCount) {
    }

    @Transactional(readOnly = true)
    public List<Visit> myVisits(LocalDate date) {
        Technician me = technicians.findByUserId(CurrentUser.id())
                .orElseThrow(() -> ApiException.forbidden("forbidden", "Not a technician"));
        ZoneId zone = bookings.zone();
        List<Assignment> mine = assignments.findForTechnician(me.getId(),
                date.atStartOfDay(zone).toInstant(), date.plusDays(1).atStartOfDay(zone).toInstant());
        List<UUID> ids = mine.stream().map(Assignment::getBookingId).toList();
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<UUID, Long> photos = new HashMap<>();
        for (Object[] row : media.countByBookings(ids)) {
            photos.put((UUID) row[0], (Long) row[1]);
        }
        return bookingRepo.findAllById(ids).stream()
                .filter(b -> b.getStatus() != BookingStatus.CANCELLED)
                .sorted(Comparator.comparing(Booking::getScheduledStart))
                .peek(b -> b.getItems().size()) // load lines for the card
                .map(b -> new Visit(b, photos.getOrDefault(b.getId(), 0L)))
                .toList();
    }
}
