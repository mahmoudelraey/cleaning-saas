package com.fieldops.app.contact;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** A "Contact us" message from the customer portal. The office marks it DONE once handled. */
@Entity
@Table(name = "contact_messages")
public class ContactMessage extends TenantScopedEntity {

    public enum Topic {
        BOOKING, QUESTION, QUOTE, COMPLAINT, OTHER
    }

    public enum Status {
        NEW, DONE
    }

    @Column(name = "customer_id", updatable = false)
    private UUID customerId;

    @Column(nullable = false, updatable = false)
    private String name;

    @Column(nullable = false, updatable = false)
    private String phone;

    @Column(updatable = false)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Topic topic;

    @Column(nullable = false, updatable = false)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.NEW;

    @Column(name = "handled_by")
    private UUID handledBy;

    @Column(name = "handled_at")
    private Instant handledAt;

    protected ContactMessage() {
    }

    public ContactMessage(UUID customerId, String name, String phone, String email, Topic topic, String message) {
        this.customerId = customerId;
        this.name = name;
        this.phone = phone;
        this.email = email;
        this.topic = topic;
        this.message = message;
    }

    public void markDone(UUID by, Instant at) {
        this.status = Status.DONE;
        this.handledBy = by;
        this.handledAt = at;
    }

    public void reopen() {
        this.status = Status.NEW;
        this.handledBy = null;
        this.handledAt = null;
    }

    public UUID getCustomerId() {
        return customerId;
    }

    public String getName() {
        return name;
    }

    public String getPhone() {
        return phone;
    }

    public String getEmail() {
        return email;
    }

    public Topic getTopic() {
        return topic;
    }

    public String getMessage() {
        return message;
    }

    public Status getStatus() {
        return status;
    }

    public UUID getHandledBy() {
        return handledBy;
    }

    public Instant getHandledAt() {
        return handledAt;
    }
}
