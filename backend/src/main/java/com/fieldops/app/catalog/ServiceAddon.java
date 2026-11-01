package com.fieldops.app.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** Optional extra on a service, e.g. "تنظيف الثلاجة من الداخل". */
@Entity
@Table(name = "service_addons")
public class ServiceAddon extends TenantScopedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false, updatable = false)
    private ServiceOffering service;

    @Column(nullable = false)
    private String name;

    @Column(name = "price_halalas", nullable = false)
    private long priceHalalas;

    @Column(nullable = false)
    private boolean active = true;

    protected ServiceAddon() {
    }

    public ServiceAddon(String name, long priceHalalas) {
        update(name, priceHalalas, true);
    }

    void attachTo(ServiceOffering service) {
        this.service = service;
    }

    public void update(String name, long priceHalalas, boolean active) {
        this.name = name;
        this.priceHalalas = priceHalalas;
        this.active = active;
    }

    public String getName() {
        return name;
    }

    public long getPriceHalalas() {
        return priceHalalas;
    }

    public boolean isActive() {
        return active;
    }
}
