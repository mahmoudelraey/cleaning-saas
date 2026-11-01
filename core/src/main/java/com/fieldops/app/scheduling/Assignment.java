package com.fieldops.app.scheduling;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/**
 * A technician blocked for a booking's time window. The database exclusion constraint
 * {@code ex_assignments_no_overlap} guarantees one technician is never assigned to overlapping windows.
 */
@Entity
@Table(name = "assignments")
public class Assignment extends TenantScopedEntity {

    @Column(name = "booking_id", nullable = false, updatable = false)
    private UUID bookingId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "technician_id", nullable = false, updatable = false)
    private Technician technician;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;

    protected Assignment() {
    }

    public Assignment(UUID bookingId, Technician technician, Instant startsAt, Instant endsAt) {
        this.bookingId = bookingId;
        this.technician = technician;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
    }

    public void moveTo(Instant startsAt, Instant endsAt) {
        this.startsAt = startsAt;
        this.endsAt = endsAt;
    }

    public UUID getBookingId() {
        return bookingId;
    }

    public Technician getTechnician() {
        return technician;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public Instant getEndsAt() {
        return endsAt;
    }
}
