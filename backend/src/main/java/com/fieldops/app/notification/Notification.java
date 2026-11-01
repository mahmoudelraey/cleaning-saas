package com.fieldops.app.notification;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;
import com.fieldops.app.notification.channel.ChannelType;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** One outgoing message: outbox entry while PENDING, send log afterwards. */
@Entity
@Table(name = "notifications")
public class Notification extends TenantScopedEntity {

    public enum Status {
        PENDING, SENT, DELIVERED, READ, FAILED, SKIPPED
    }

    /** Back-off between attempts: 1 min, 5 min, 15 min, 1 h, then give up. */
    private static final List<Duration> BACKOFF = List.of(
            Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(15), Duration.ofHours(1));

    @Column(name = "booking_id")
    private UUID bookingId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private NotificationTemplate template;

    @Enumerated(EnumType.STRING)
    private ChannelType channel;

    @Column(name = "to_phone", nullable = false, updatable = false)
    private String toPhone;

    @Column(nullable = false)
    private String body;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private List<String> params = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    @Column(name = "provider_message_id")
    private String providerMessageId;

    private String error;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    protected Notification() {
    }

    public Notification(UUID bookingId, NotificationTemplate template, String toPhone, List<String> params,
                        Instant notBefore) {
        this.bookingId = bookingId;
        this.template = template;
        this.toPhone = toPhone;
        this.params = new ArrayList<>(params);
        this.body = template.render(params);
        this.nextAttemptAt = notBefore;
    }

    public void markSent(ChannelType channel, String providerMessageId, Instant at) {
        this.channel = channel;
        this.providerMessageId = providerMessageId;
        this.status = Status.SENT;
        this.sentAt = at;
        this.attempts++;
        this.error = null;
    }

    /** @return true if another attempt is scheduled */
    public boolean markFailed(ChannelType channel, String error, boolean permanent, Instant now) {
        this.channel = channel;
        this.attempts++;
        this.error = error == null ? null : error.substring(0, Math.min(error.length(), 500));
        if (permanent || attempts > BACKOFF.size()) {
            this.status = Status.FAILED;
            return false;
        }
        this.nextAttemptAt = now.plus(BACKOFF.get(attempts - 1));
        return true;
    }

    public void markSkipped(String reason) {
        this.status = Status.SKIPPED;
        this.error = reason;
    }

    public void markDelivery(Status newStatus, Instant at) {
        if (newStatus == Status.FAILED) {
            if (status == Status.SENT) {
                status = Status.FAILED;
            }
            return;
        }
        // Receipts can arrive out of order; never go backwards (READ beats DELIVERED beats SENT).
        if (status == Status.FAILED || newStatus.ordinal() <= status.ordinal()) {
            return;
        }
        status = newStatus;
        if (deliveredAt == null) {
            deliveredAt = at;
        }
    }

    public UUID getBookingId() {
        return bookingId;
    }

    public NotificationTemplate getTemplate() {
        return template;
    }

    public ChannelType getChannel() {
        return channel;
    }

    public String getToPhone() {
        return toPhone;
    }

    public String getBody() {
        return body;
    }

    public List<String> getParams() {
        return params;
    }

    public Status getStatus() {
        return status;
    }

    public String getProviderMessageId() {
        return providerMessageId;
    }

    public String getError() {
        return error;
    }

    public int getAttempts() {
        return attempts;
    }

    public Instant getNextAttemptAt() {
        return nextAttemptAt;
    }

    public Instant getSentAt() {
        return sentAt;
    }

    public Instant getDeliveredAt() {
        return deliveredAt;
    }
}
