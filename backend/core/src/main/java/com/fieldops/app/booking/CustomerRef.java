package com.fieldops.app.booking;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.Immutable;

/**
 * Read-only view of a booking's customer: just what a booking shows. Unlike {@code Customer} it also sees
 * archived (soft-deleted) customers, so past bookings keep their name. Tenant isolation comes from Row Level
 * Security on {@code customers}.
 */
@Entity(name = "BookingCustomer")
@Table(name = "customers")
@Immutable
@BatchSize(size = 50)
public class CustomerRef {

    @Id
    private UUID id;

    @Column(name = "name")
    private String name;

    @Column(name = "phone")
    private String phone;

    protected CustomerRef() {
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getPhone() {
        return phone;
    }
}
