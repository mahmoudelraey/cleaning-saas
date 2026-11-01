package com.fieldops.app.geo;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "geo_cities")
public class GeoCity {

    @Id
    private Integer id;

    @Column(name = "region_id", nullable = false)
    private short regionId;

    @Column(name = "name_ar", nullable = false)
    private String nameAr;

    @Column(name = "name_en", nullable = false)
    private String nameEn;

    @Column(name = "district_count", nullable = false)
    private int districtCount;

    protected GeoCity() {
    }

    public Integer getId() {
        return id;
    }

    public short getRegionId() {
        return regionId;
    }

    public String getNameAr() {
        return nameAr;
    }

    public String getNameEn() {
        return nameEn;
    }

    public int getDistrictCount() {
        return districtCount;
    }
}
