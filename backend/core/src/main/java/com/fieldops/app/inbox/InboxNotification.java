package com.fieldops.app.inbox;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** One in-app notification for one recipient (a staff user or a customer). The text is built by the apps from kind. */
@Entity
@Table(name = "inbox_notifications")
public class InboxNotification extends TenantScopedEntity {

    @Column(name = "user_id", updatable = false)
    private UUID userId;

    @Column(name = "customer_id", updatable = false)
    private UUID customerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private InboxKind kind;

    @Column(name = "booking_id", updatable = false)
    private UUID bookingId;

    @Column(name = "ref_id", updatable = false)
    private UUID refId;

    @Column(updatable = false)
    private Long number;

    @Column(updatable = false)
    private String actor;

    @Column(name = "read_at")
    private Instant readAt;

    protected InboxNotification() {
    }

    static InboxNotification forUser(UUID userId, InboxKind kind, UUID bookingId, UUID refId, Long number, String actor) {
        InboxNotification n = new InboxNotification(kind, bookingId, refId, number, actor);
        n.userId = userId;
        return n;
    }

    static InboxNotification forCustomer(UUID customerId, InboxKind kind, UUID bookingId, UUID refId, Long number,
                                         String actor) {
        InboxNotification n = new InboxNotification(kind, bookingId, refId, number, actor);
        n.customerId = customerId;
        return n;
    }

    private InboxNotification(InboxKind kind, UUID bookingId, UUID refId, Long number, String actor) {
        this.kind = kind;
        this.bookingId = bookingId;
        this.refId = refId;
        this.number = number;
        this.actor = actor == null || actor.length() <= 150 ? actor : actor.substring(0, 150);
    }

    void markRead(Instant at) {
        if (readAt == null) {
            readAt = at;
        }
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getCustomerId() {
        return customerId;
    }

    public InboxKind getKind() {
        return kind;
    }

    public UUID getBookingId() {
        return bookingId;
    }

    public UUID getRefId() {
        return refId;
    }

    public Long getNumber() {
        return number;
    }

    public String getActor() {
        return actor;
    }

    public Instant getReadAt() {
        return readAt;
    }
}
