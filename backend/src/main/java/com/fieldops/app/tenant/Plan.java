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

    protected Plan() {
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
