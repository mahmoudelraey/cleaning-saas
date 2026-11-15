package com.fieldops.app.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/**
 * A sub-service with its own price, e.g. "سيارة كبيرة" under "غسيل سيارة". When a service has active options the
 * customer must choose one; its price (and its duration, when set) replaces the service's base price / duration.
 */
@Entity
@Table(name = "service_options")
public class ServiceOption extends TenantScopedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false, updatable = false)
    private ServiceOffering service;

    @Column(nullable = false)
    private String name;

    /** English name; {@code name} is the Arabic (main) one. */
    @Column(name = "name_en")
    private String nameEn;

    @Column(name = "price_halalas", nullable = false)
    private long priceHalalas;

    /** Minutes for one unit; null = the service's duration. */
    @Column(name = "duration_min")
    private Integer durationMin;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private int position;

    protected ServiceOption() {
    }

    public ServiceOption(String name, String nameEn, long priceHalalas, Integer durationMin, boolean active, int position) {
        update(name, nameEn, priceHalalas, durationMin, active, position);
    }

    void attachTo(ServiceOffering service) {
        this.service = service;
    }

    public void update(String name, String nameEn, long priceHalalas, Integer durationMin, boolean active, int position) {
        this.name = name;
        this.nameEn = nameEn;
        this.priceHalalas = priceHalalas;
        this.durationMin = durationMin;
        this.active = active;
        this.position = position;
    }

    public void deactivate() {
        this.active = false;
    }

    public ServiceOffering getService() {
        return service;
    }

    public String getName() {
        return name;
    }

    public String getNameEn() {
        return nameEn;
    }

    public long getPriceHalalas() {
        return priceHalalas;
    }

    public Integer getDurationMin() {
        return durationMin;
    }

    public boolean isActive() {
        return active;
    }

    public int getPosition() {
        return position;
    }
}
