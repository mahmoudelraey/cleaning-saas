package com.fieldops.app.review;

import java.util.List;
import java.util.UUID;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingRepository;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.inbox.InboxKind;
import com.fieldops.app.inbox.InboxService;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Customer ratings of completed visits, and the owner's choice of which ones the public page shows. */
@Service
public class ReviewService {

    private final VisitReviewRepository reviews;
    private final BookingRepository bookings;
    private final InboxService inbox;

    public ReviewService(VisitReviewRepository reviews, BookingRepository bookings, InboxService inbox) {
        this.reviews = reviews;
        this.bookings = bookings;
        this.inbox = inbox;
    }

    /** The visit's own customer rates it once it is completed; rating again replaces the earlier one. */
    @Transactional
    public VisitReview rate(UUID customerId, UUID bookingId, int rating, String comment) {
        if (rating < 1 || rating > 5) {
            throw ApiException.badRequest("invalid_rating", "Rating must be 1 to 5");
        }
        Booking b = bookings.findById(bookingId)
                .filter(x -> customerId.equals(x.getCustomerId()))
                .orElseThrow(() -> ApiException.notFound("booking"));
        if (b.getStatus() != BookingStatus.COMPLETED) {
            throw ApiException.conflict("review_not_allowed", "Only completed visits can be rated");
        }
        String text = comment == null || comment.isBlank() ? null : comment.trim();
        return reviews.findByBookingId(bookingId)
                .map(r -> {
                    r.rate(rating, text);
                    return r;
                })
                .orElseGet(() -> {
                    VisitReview created = reviews.save(new VisitReview(bookingId, customerId, rating, text));
                    inbox.toStaff(InboxKind.REVIEW_NEW, bookingId, created.getId(), b.getNumber(), b.getCustomerName(), null);
                    return created;
                });
    }

    @Transactional(readOnly = true)
    public List<ReviewRow> recent() {
        return reviews.recent(PageRequest.of(0, 200));
    }

    @Transactional
    public void setPublished(UUID reviewId, boolean published) {
        VisitReview r = reviews.findById(reviewId).orElseThrow(() -> ApiException.notFound("review"));
        r.setPublished(published);
    }
}
