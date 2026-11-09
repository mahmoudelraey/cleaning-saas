package com.fieldops.app.review;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface VisitReviewRepository extends JpaRepository<VisitReview, UUID> {

    Optional<VisitReview> findByBookingId(UUID bookingId);

    @Query("""
            select new com.fieldops.app.review.ReviewRow(r.id, r.bookingId, b.number, c.name,
                   cast(r.rating as Integer), r.comment, r.published, r.createdAt)
            from VisitReview r, Booking b, Customer c
            where b.id = r.bookingId and c.id = r.customerId
            order by r.createdAt desc
            """)
    List<ReviewRow> recent(Pageable page);
}
