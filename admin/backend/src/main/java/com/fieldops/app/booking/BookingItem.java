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

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** One priced line: a service (quantity = 1, hours or m²) or one of its add-ons. Prices are snapshots. */
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

    @Column(nullable = false)
    private String description;

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
        this.description = description;
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

    public String getDescription() {
        return description;
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
