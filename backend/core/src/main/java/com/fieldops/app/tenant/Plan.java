package com.fieldops.app.tenant;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "plans")
public class Plan {

    @Id
    private String id;

    @Column(name = "name_ar", nullable = false)
    private String nameAr;

    @Column(name = "name_en", nullable = false)
    private String nameEn;

    @Column(name = "price_monthly_halalas", nullable = false)
    private long priceMonthlyHalalas;

    @Column(name = "max_technicians", nullable = false)
    private int maxTechnicians;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "features", nullable = false)
    private List<String> features = new ArrayList<>();

    @Column(nullable = false)
    private boolean active;

    /** Optional price for a year paid up front (usually a discount on 12 × monthly). */
    @Column(name = "price_yearly_halalas")
    private Long priceYearlyHalalas;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "updated_at", nullable = false)
    private java.time.Instant updatedAt = java.time.Instant.now();

    protected Plan() {
    }

    /** A new plan created in the platform console (id is a short lowercase code, e.g. "starter"). */
    public Plan(String id) {
        this.id = id;
    }

    /** Edited by the platform owner. {@code active} = offered to companies (shown in the plan picker). */
    public void update(String nameAr, String nameEn, long priceMonthlyHalalas, Long priceYearlyHalalas,
                       int maxTechnicians, List<String> features, boolean active, int sortOrder) {
        this.nameAr = nameAr;
        this.nameEn = nameEn;
        this.priceMonthlyHalalas = priceMonthlyHalalas;
        this.priceYearlyHalalas = priceYearlyHalalas;
        this.maxTechnicians = maxTechnicians;
        this.features = new ArrayList<>(features);
        this.active = active;
        this.sortOrder = sortOrder;
        this.updatedAt = java.time.Instant.now();
    }

    public Long getPriceYearlyHalalas() {
        return priceYearlyHalalas;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public String getId() {
        return id;
    }

    public String getNameAr() {
        return nameAr;
    }

    public String getNameEn() {
        return nameEn;
    }

    public long getPriceMonthlyHalalas() {
        return priceMonthlyHalalas;
    }

    public int getMaxTechnicians() {
        return maxTechnicians;
    }

    public List<String> getFeatures() {
        return features;
    }

    public boolean isActive() {
        return active;
    }
}
