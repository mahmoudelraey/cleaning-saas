package com.fieldops.app.booking;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** Append-only timeline of a booking: created, status changes, assignments, reschedules, notes. */
@Entity
@Table(name = "visit_events")
public class VisitEvent extends TenantScopedEntity {

    public enum Type {
        CREATED, STATUS_CHANGED, ASSIGNED, UNASSIGNED, RESCHEDULED, UPDATED, NOTE, PHOTO_ADDED, INVOICE_ISSUED
    }

    @Column(name = "booking_id", nullable = false, updatable = false)
    private UUID bookingId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Type type;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", updatable = false)
    private BookingStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", updatable = false)
    private BookingStatus toStatus;

    @Column(updatable = false)
    private String note;

    @Column(name = "actor_name", updatable = false)
    private String actorName;

    protected VisitEvent() {
    }

    public VisitEvent(UUID bookingId, Type type, BookingStatus from, BookingStatus to, String note, String actorName) {
        this.bookingId = bookingId;
        this.type = type;
        this.fromStatus = from;
        this.toStatus = to;
        this.note = note;
        this.actorName = actorName;
    }

    public UUID getBookingId() {
        return bookingId;
    }

    public Type getType() {
        return type;
    }

    public BookingStatus getFromStatus() {
        return fromStatus;
    }

    public BookingStatus getToStatus() {
        return toStatus;
    }

    public String getNote() {
        return note;
    }

    public String getActorName() {
        return actorName;
    }
}
