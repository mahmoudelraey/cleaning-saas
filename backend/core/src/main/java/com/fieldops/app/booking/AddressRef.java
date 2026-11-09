package com.fieldops.app.booking;

import java.math.BigDecimal;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.Immutable;

/**
 * Read-only view of a booking's address. Addresses are archived rather than deleted, so this always resolves,
 * including for an address the customer has since removed from their list.
 */
@Entity(name = "BookingAddress")
@Table(name = "addresses")
@Immutable
@BatchSize(size = 50)
public class AddressRef {

    @Id
    private UUID id;

    private String label;

    private String city;

    private String district;

    private String details;

    @Column(precision = 9, scale = 6)
    private BigDecimal lat;

    @Column(precision = 9, scale = 6)
    private BigDecimal lng;

    @Column(name = "map_url")
    private String mapUrl;

    protected AddressRef() {
    }

    /** "Home، Riyadh، Al Malqa، street 12" — the parts that are filled in. */
    public static String text(String label, String city, String district, String details) {
        String t = Stream.of(label, city, district, details)
                .filter(s -> s != null && !s.isBlank())
                .collect(Collectors.joining("، "));
        return t.isEmpty() ? null : t;
    }

    public String text() {
        return text(label, city, district, details);
    }

    public UUID getId() {
        return id;
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
