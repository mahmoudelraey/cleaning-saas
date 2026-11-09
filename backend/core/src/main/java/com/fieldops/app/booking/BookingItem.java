package com.fieldops.app.booking;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import com.fieldops.app.catalog.ServiceAddon;
import com.fieldops.app.catalog.ServiceOffering;
import com.fieldops.app.common.persistence.TenantScopedEntity;

/**
 * One priced line: a service (quantity = 1, hours or m²) or one of its add-ons. Prices are kept as agreed at
 * booking time; the name is read from the service / add-on (services are archived, never deleted).
 */
@Entity
@Table(name = "booking_items")
public class BookingItem extends TenantScopedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "booking_id", nullable = false, updatable = false)
    private Booking booking;

    @Column(name = "service_id", nullable = false)
    private UUID serviceId;

    @Column(name = "addon_id")
    private UUID addonId;

    /** Read-only; {@link #serviceId} is the column that is written. */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "service_id", insertable = false, updatable = false)
    private ServiceOffering service;

    /** Read-only; {@link #addonId} is the column that is written. */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "addon_id", insertable = false, updatable = false)
    private ServiceAddon addon;

    /** The name given when the item was priced in this session (before the service row is loaded with it). */
    @Transient
    private String pendingDescription;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal quantity;

    @Column(name = "unit_price_halalas", nullable = false)
    private long unitPriceHalalas;

    @Column(name = "total_halalas", nullable = false)
    private long totalHalalas;

    @Column(nullable = false)
    private int position;

    protected BookingItem() {
    }

    public BookingItem(UUID serviceId, UUID addonId, String description, BigDecimal quantity, long unitPriceHalalas) {
        this.serviceId = serviceId;
        this.addonId = addonId;
        this.pendingDescription = description;
        this.quantity = quantity.setScale(2, RoundingMode.HALF_UP);
        this.unitPriceHalalas = unitPriceHalalas;
        // Round half-up to the nearest halala, the way a cashier would.
        this.totalHalalas = this.quantity.multiply(BigDecimal.valueOf(unitPriceHalalas))
                .setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    void attachTo(Booking booking, int position) {
        this.booking = booking;
        this.position = position;
    }

    public UUID getServiceId() {
        return serviceId;
    }

    public UUID getAddonId() {
        return addonId;
    }

    /** "Apartment cleaning" or "Apartment cleaning — Fridge", in Arabic (the main name). */
    public String getDescription() {
        if (service == null) {
            return pendingDescription;
        }
        return addon == null ? service.getName() : service.getName() + " — " + addon.getName();
    }

    /** The same in English, or null when the service (or add-on) has no English name. */
    public String getDescriptionEn() {
        if (service == null || service.getNameEn() == null || service.getNameEn().isBlank()) {
            return null;
        }
        if (addon == null) {
            return service.getNameEn();
        }
        return addon.getNameEn() == null || addon.getNameEn().isBlank() ? null
                : service.getNameEn() + " — " + addon.getNameEn();
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public long getUnitPriceHalalas() {
        return unitPriceHalalas;
    }

    public long getTotalHalalas() {
        return totalHalalas;
    }

    public int getPosition() {
        return position;
    }
}
