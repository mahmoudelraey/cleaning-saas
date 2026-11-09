package com.fieldops.app.review;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** A customer's rating of one completed visit. Shown on the public page only once the owner publishes it. */
@Entity
@Table(name = "visit_reviews")
public class VisitReview extends TenantScopedEntity {

    @Column(name = "booking_id", nullable = false, updatable = false, unique = true)
    private UUID bookingId;

    @Column(name = "customer_id", nullable = false, updatable = false)
    private UUID customerId;

    @Column(nullable = false)
    private short rating;

    private String comment;

    @Column(nullable = false)
    private boolean published;

    protected VisitReview() {
    }

    public VisitReview(UUID bookingId, UUID customerId, int rating, String comment) {
        this.bookingId = bookingId;
        this.customerId = customerId;
        rate(rating, comment);
    }

    /** The customer changes their rating; it leaves the public page until the owner publishes it again. */
    public void rate(int rating, String comment) {
        this.rating = (short) rating;
        this.comment = comment;
        this.published = false;
    }

    public void setPublished(boolean published) {
        this.published = published;
    }

    public UUID getBookingId() {
        return bookingId;
    }

    public UUID getCustomerId() {
        return customerId;
    }

    public int getRating() {
        return rating;
    }

    public String getComment() {
        return comment;
    }

    public boolean isPublished() {
        return published;
    }
}
