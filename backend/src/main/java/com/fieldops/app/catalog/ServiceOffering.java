package com.fieldops.app.catalog;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** A service the company sells (table {@code services}; named to avoid clashing with Spring's @Service). */
@Entity
@Table(name = "services")
public class ServiceOffering extends TenantScopedEntity {

    @Column(nullable = false)
    private String name;

    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "pricing_type", nullable = false)
    private PricingType pricingType;

    @Column(name = "base_price_halalas", nullable = false)
    private long basePriceHalalas;

    @Column(name = "duration_min", nullable = false)
    private int durationMin;

    @Column(nullable = false)
    private boolean active = true;

    @OneToMany(mappedBy = "service", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt asc")
    private List<ServiceAddon> addons = new ArrayList<>();

    protected ServiceOffering() {
    }

    public ServiceOffering(String name, String description, PricingType pricingType, long basePriceHalalas,
                           int durationMin) {
        update(name, description, pricingType, basePriceHalalas, durationMin, true);
    }

    public void update(String name, String description, PricingType pricingType, long basePriceHalalas,
                       int durationMin, boolean active) {
        this.name = name;
        this.description = description;
        this.pricingType = pricingType;
        this.basePriceHalalas = basePriceHalalas;
        this.durationMin = durationMin;
        this.active = active;
    }

    public void deactivate() {
        this.active = false;
    }

    public ServiceAddon addAddon(ServiceAddon addon) {
        addon.attachTo(this);
        addons.add(addon);
        return addon;
    }

    public void removeAddon(ServiceAddon addon) {
        addons.remove(addon);
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public PricingType getPricingType() {
        return pricingType;
    }

    public long getBasePriceHalalas() {
        return basePriceHalalas;
    }

    public int getDurationMin() {
        return durationMin;
    }

    public boolean isActive() {
        return active;
    }

    public List<ServiceAddon> getAddons() {
        return addons;
    }
}
