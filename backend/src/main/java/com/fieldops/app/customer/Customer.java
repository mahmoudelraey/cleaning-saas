package com.fieldops.app.customer;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;
import org.hibernate.annotations.SQLRestriction;

/** End customer of a company (the person who books a cleaning/maintenance visit). Soft-deleted. */
@Entity
@Table(name = "customers")
@SQLRestriction("deleted_at is null")
public class Customer extends TenantScopedEntity {

    @Column(nullable = false)
    private String name;

    /** E.164, e.g. +9665XXXXXXXX. */
    @Column(nullable = false)
    private String phone;

    private String email;

    private String notes;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @OneToMany(mappedBy = "customer", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt asc")
    private List<Address> addresses = new ArrayList<>();

    protected Customer() {
    }

    public Customer(String name, String phone, String email, String notes) {
        update(name, phone, email, notes);
    }

    public void update(String name, String phone, String email, String notes) {
        this.name = name;
        this.phone = phone;
        this.email = email;
        this.notes = notes;
    }

    public void softDelete(Instant at) {
        this.deletedAt = at;
    }

    public Address addAddress(Address address) {
        address.attachTo(this);
        addresses.add(address);
        return address;
    }

    public void removeAddress(Address address) {
        addresses.remove(address);
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

    public String getNotes() {
        return notes;
    }

    public List<Address> getAddresses() {
        return addresses;
    }
}
