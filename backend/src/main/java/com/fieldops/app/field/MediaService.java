package com.fieldops.app.field;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingService;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.booking.VisitEvent;
import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.storage.FileStorage;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MediaService {

    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    public static final long MAX_BYTES = 10L * 1024 * 1024;
    public static final int MAX_PER_BOOKING = 40;

    /** Photos make sense once a technician is on the job (and for corrections right after). */
    private static final Set<BookingStatus> PHOTO_STATUSES = EnumSet.of(
            BookingStatus.ASSIGNED, BookingStatus.ON_THE_WAY, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED);

    private final MediaRepository media;
    private final BookingService bookings;
    private final FileStorage storage;

    public MediaService(MediaRepository media, BookingService bookings, FileStorage storage) {
        this.media = media;
        this.bookings = bookings;
        this.storage = storage;
    }

    public record Content(Media media, InputStream stream) {
    }

    @Transactional
    public Media upload(UUID bookingId, Media.Kind kind, MultipartFile file) {
        Booking booking = bookings.get(bookingId);
        assertCanAccess(booking.getId());
        if (!PHOTO_STATUSES.contains(booking.getStatus())) {
            throw ApiException.conflict("photos_not_allowed", "Photos can be added once a technician is assigned");
        }
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("file_required", "Choose a photo");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "file_too_large", "Photo is larger than 10 MB");
        }
        if (media.findByBookingIdOrderByCreatedAtAsc(bookingId).size() >= MAX_PER_BOOKING) {
            throw ApiException.conflict("too_many_photos", "This visit already has the maximum number of photos");
        }

        try (InputStream raw = file.getInputStream(); BufferedInputStream in = new BufferedInputStream(raw)) {
            in.mark(16);
            byte[] head = in.readNBytes(16);
            in.reset();
            ImageTypes.Detected type = ImageTypes.detect(head)
                    .orElseThrow(() -> ApiException.badRequest("unsupported_file", "Only JPEG, PNG, WebP or HEIC photos"));

            String key = TenantContext.require() + "/media/" + bookingId + "/" + UUID.randomUUID() + "." + type.extension();
            storage.put(key, in, file.getSize(), type.contentType());
            deleteFileIfTransactionRollsBack(key);

            Media saved = media.save(new Media(bookingId, kind, key, type.contentType(), file.getSize(),
                    CurrentUser.nameOrNull()));
            bookings.log(bookingId, VisitEvent.Type.PHOTO_ADDED, null, null, kind.name());
            return saved;
        } catch (IOException e) {
            throw ApiException.badRequest("upload_failed", "Could not read the uploaded file");
        }
    }

    @Transactional(readOnly = true)
    public List<Media> list(UUID bookingId) {
        Booking booking = bookings.get(bookingId);
        assertCanAccess(booking.getId());
        return media.findByBookingIdOrderByCreatedAtAsc(bookingId);
    }

    @Transactional(readOnly = true)
    public Content open(UUID mediaId) {
        Media m = media.findById(mediaId).orElseThrow(() -> ApiException.notFound("media"));
        assertCanAccess(m.getBookingId());
        return new Content(m, storage.get(m.getStorageKey()));
    }

    @Transactional
    public void delete(UUID mediaId) {
        Media m = media.findById(mediaId).orElseThrow(() -> ApiException.notFound("media"));
        assertCanAccess(m.getBookingId());
        if (CurrentUser.role() == Role.TECHNICIAN) {
            Booking b = bookings.get(m.getBookingId());
            if (b.getStatus() == BookingStatus.COMPLETED || !java.util.Objects.equals(m.getCreatedBy(), CurrentUser.id())) {
                throw ApiException.forbidden("forbidden", "Only the office can remove this photo");
            }
        }
        media.delete(m);
        String key = m.getStorageKey();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    storage.delete(key);
                } catch (RuntimeException e) {
                    log.warn("Could not delete stored file {}", key, e);
                }
            }
        });
    }

    private void assertCanAccess(UUID bookingId) {
        if (CurrentUser.roleOrNull() == Role.TECHNICIAN) {
            bookings.assertAssignedToCurrentTechnician(bookingId);
        }
    }

    /** Keeps storage consistent with the DB: an upload whose transaction fails leaves no orphan file. */
    private void deleteFileIfTransactionRollsBack(String key) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    try {
                        storage.delete(key);
                    } catch (RuntimeException e) {
                        log.warn("Could not clean up orphan file {}", key, e);
                    }
                }
            }
        });
    }
}
