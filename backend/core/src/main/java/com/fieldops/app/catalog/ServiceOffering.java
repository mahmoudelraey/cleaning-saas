package com.fieldops.app.catalog;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

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

    /** English name; {@code name} is the Arabic (main) one. */
    @Column(name = "name_en")
    private String nameEn;

    @Column(name = "description_en")
    private String descriptionEn;

    @Enumerated(EnumType.STRING)
    @Column(name = "pricing_type", nullable = false)
    private PricingType pricingType;

    @Column(name = "base_price_halalas", nullable = false)
    private long basePriceHalalas;

    @Column(name = "duration_min", nullable = false)
    private int durationMin;

    @Column(nullable = false)
    private boolean active = true;

    /** Storage key of the service's photo (null = the portal's default picture). */
    @Column(name = "image_key")
    private String imageKey;

    @OneToMany(mappedBy = "service", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("createdAt asc")
    private List<ServiceAddon> addons = new ArrayList<>();

    /**
     * Sizes / types with their own price. A Set (not a List) so it can be fetched together with {@code addons}
     * in one query; {@link #getOptions()} returns them in their display order.
     */
    @OneToMany(mappedBy = "service", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ServiceOption> options = new LinkedHashSet<>();

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

    public ServiceOption addOption(ServiceOption option) {
        option.attachTo(this);
        options.add(option);
        return option;
    }

    public void removeOption(ServiceOption option) {
        options.remove(option);
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public String getNameEn() {
        return nameEn;
    }

    public String getDescriptionEn() {
        return descriptionEn;
    }

    /** English name and description (null = same as the Arabic). */
    public void setEnglish(String nameEn, String descriptionEn) {
        this.nameEn = nameEn;
        this.descriptionEn = descriptionEn;
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

    /** Sets (or clears, with null) the photo and returns the key it replaced, for deleting the old file. */
    public String replaceImage(String key) {
        String old = this.imageKey;
        this.imageKey = key;
        return old;
    }

    public String getImageKey() {
        return imageKey;
    }

    /**
     * Public address of the photo on the admin backend (null without one). The {@code v} part changes with every
     * upload, so browsers and caches never show an old picture.
     */
    public String getImageUrl() {
        if (imageKey == null) {
            return null;
        }
        String file = imageKey.substring(imageKey.lastIndexOf('/') + 1);
        int dot = file.indexOf('.');
        return "/api/v1/public/services/" + getTenantId() + "/" + getId() + "/image?v="
                + (dot > 0 ? file.substring(0, dot) : file);
    }

    public List<ServiceAddon> getAddons() {
        return addons;
    }

    /** All options (active or not) in display order. */
    public List<ServiceOption> getOptions() {
        return options.stream()
                .sorted(Comparator.comparingInt(ServiceOption::getPosition)
                        .thenComparing(o -> o.getCreatedAt() == null ? java.time.Instant.MAX : o.getCreatedAt()))
                .toList();
    }

    /** The options customers can choose from; empty = the service is booked at its base price. */
    public List<ServiceOption> getActiveOptions() {
        return getOptions().stream().filter(ServiceOption::isActive).toList();
    }
}
