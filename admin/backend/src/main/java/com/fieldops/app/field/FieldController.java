package com.fieldops.app.field;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingItem;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.RequiresFeature;
import org.springframework.core.io.InputStreamResource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Technician PWA endpoints and visit photos (plan section 7). */
@RestController
public class FieldController {

    private final TechnicianVisitService visits;
    private final MediaService media;

    public FieldController(TechnicianVisitService visits, MediaService media) {
        this.visits = visits;
        this.media = media;
    }

    @GetMapping("/api/v1/technicians/me/visits")
    @PreAuthorize("hasRole('TECHNICIAN')")
    public List<VisitCard> myVisits(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return visits.myVisits(date).stream().map(VisitCard::of).toList();
    }

    /** New photos need the plan feature; photos already taken stay viewable after a downgrade. */
    @RequiresFeature(PlanFeature.PHOTOS)
    @PostMapping(path = "/api/v1/visits/{bookingId}/media", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR','TECHNICIAN')")
    public MediaDto upload(@PathVariable UUID bookingId,
                           @RequestParam(defaultValue = "OTHER") Media.Kind kind,
                           @RequestPart("file") MultipartFile file) {
        return MediaDto.of(media.upload(bookingId, kind, file));
    }

    @GetMapping("/api/v1/bookings/{bookingId}/media")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR','TECHNICIAN')")
    public List<MediaDto> list(@PathVariable UUID bookingId) {
        return media.list(bookingId).stream().map(MediaDto::of).toList();
    }

    /** Streams the photo. Authenticated (the UI fetches it as a blob), never a public URL. */
    @GetMapping("/api/v1/media/{id}/content")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR','TECHNICIAN')")
    public ResponseEntity<InputStreamResource> content(@PathVariable UUID id) {
        MediaService.Content c = media.open(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(c.media().getContentType()))
                .contentLength(c.media().getSizeBytes())
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofDays(7)).cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(new InputStreamResource(c.stream()));
    }

    @DeleteMapping("/api/v1/media/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR','TECHNICIAN')")
    public void delete(@PathVariable UUID id) {
        media.delete(id);
    }

    public record MediaDto(UUID id, UUID bookingId, Media.Kind kind, String contentType, long sizeBytes,
                           String uploadedByName, Instant createdAt) {
        static MediaDto of(Media m) {
            return new MediaDto(m.getId(), m.getBookingId(), m.getKind(), m.getContentType(), m.getSizeBytes(),
                    m.getUploadedByName(), m.getCreatedAt());
        }
    }

    public record VisitCard(UUID id, long number, BookingStatus status, Instant scheduledStart, Instant scheduledEnd,
                            String customerName, String customerPhone, String addressText, String navigationUrl,
                            String notes, List<String> services, long photoCount,
                            Set<BookingStatus> allowedTransitions) {
        static VisitCard of(TechnicianVisitService.Visit v) {
            Booking b = v.booking();
            return new VisitCard(b.getId(), b.getNumber(), b.getStatus(), b.getScheduledStart(), b.getScheduledEnd(),
                    b.getCustomerName(), b.getCustomerPhone(), b.getAddressText(), b.navigationUrl(), b.getNotes(),
                    b.getItems().stream().map(BookingItem::getDescription).toList(), v.photoCount(),
                    b.getStatus().nextFor(Role.TECHNICIAN));
        }
    }
}
