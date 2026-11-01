package com.fieldops.app.customer;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

@Entity
@Table(name = "addresses")
public class Address extends TenantScopedEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false, updatable = false)
    private Customer customer;

    /** e.g. "المنزل", "المكتب". */
    @Column(nullable = false)
    private String label;

    private String city;

    private String district;

    /** Lookup ids (geo_cities / geo_districts); null for older free-text addresses. */
    @Column(name = "city_id")
    private Integer cityId;

    @Column(name = "district_id")
    private Long districtId;

    private String details;

    @Column(precision = 9, scale = 6)
    private BigDecimal lat;

    @Column(precision = 9, scale = 6)
    private BigDecimal lng;

    @Column(name = "map_url")
    private String mapUrl;

    protected Address() {
    }

    public Address(String label, String city, String district, String details, BigDecimal lat, BigDecimal lng,
                   String mapUrl) {
        update(label, city, district, details, lat, lng, mapUrl);
    }

    void attachTo(Customer customer) {
        this.customer = customer;
    }

    public void update(String label, String city, String district, String details, BigDecimal lat, BigDecimal lng,
                       String mapUrl) {
        this.label = label;
        this.city = city;
        this.district = district;
        this.details = details;
        this.lat = lat;
        this.lng = lng;
        this.mapUrl = mapUrl;
    }

    public void setPlace(Integer cityId, Long districtId) {
        this.cityId = cityId;
        this.districtId = districtId;
    }

    public Integer getCityId() {
        return cityId;
    }

    public Long getDistrictId() {
        return districtId;
    }

    /** Link that opens the location in Google Maps (technician app uses this). */
    public String navigationUrl() {
        if (lat != null && lng != null) {
            return "https://www.google.com/maps/search/?api=1&query=" + lat.toPlainString() + "," + lng.toPlainString();
        }
        return mapUrl;
    }

    public Customer getCustomer() {
        return customer;
    }

    public String getLabel() {
        return label;
    }

    public String getCity() {
        return city;
    }

    public String getDistrict() {
        return district;
    }

    public String getDetails() {
        return details;
    }

    public BigDecimal getLat() {
        return lat;
    }

    public BigDecimal getLng() {
        return lng;
    }

    public String getMapUrl() {
        return mapUrl;
    }
}
