package com.fieldops.app.promo;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/**
 * A discount code customers type while booking in the portal. One that is {@link #announce announced} also shows
 * as a bar on the company's public page while it is valid. Bookings keep the code and the discount they got, so
 * editing or deleting a promo never changes past bookings.
 */
@Entity
@Table(name = "promos")
public class Promo extends TenantScopedEntity {

    public enum DiscountType {
        /** {@code discountValue} is a percent, 1-100. */
        PERCENT,
        /** {@code discountValue} is halalas off the booking. */
        AMOUNT
    }

    @Column(nullable = false)
    private String code;

    @Column(nullable = false)
    private String title;

    @Column(name = "title_en")
    private String titleEn;

    @Enumerated(EnumType.STRING)
    @Column(name = "discount_type", nullable = false)
    private DiscountType discountType;

    @Column(name = "discount_value", nullable = false)
    private long discountValue;

    @Column(name = "max_discount_halalas")
    private Long maxDiscountHalalas;

    @Column(name = "min_subtotal_halalas", nullable = false)
    private long minSubtotalHalalas;

    @Column(name = "starts_at")
    private Instant startsAt;

    /** The moment it stops working (exclusive). */
    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "usage_limit")
    private Integer usageLimit;

    @Column(name = "per_customer_limit")
    private Integer perCustomerLimit;

    @Column(name = "first_booking_only", nullable = false)
    private boolean firstBookingOnly;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean announce;

    protected Promo() {
    }

    public Promo(String code) {
        this.code = code;
    }

    /** Everything the office can change (the code too). Values are already validated by {@link PromoService}. */
    public void update(String code, String title, String titleEn, DiscountType type, long value, Long maxDiscount,
                       long minSubtotal, Instant startsAt, Instant endsAt, Integer usageLimit, Integer perCustomerLimit,
                       boolean firstBookingOnly, boolean active, boolean announce) {
        this.code = code;
        this.title = title;
        this.titleEn = titleEn;
        this.discountType = type;
        this.discountValue = value;
        this.maxDiscountHalalas = type == DiscountType.PERCENT ? maxDiscount : null;
        this.minSubtotalHalalas = minSubtotal;
        this.startsAt = startsAt;
        this.endsAt = endsAt;
        this.usageLimit = usageLimit;
        this.perCustomerLimit = perCustomerLimit;
        this.firstBookingOnly = firstBookingOnly;
        this.active = active;
        this.announce = announce;
    }

    /** What this promo takes off a booking of {@code subtotal} halalas (never more than the subtotal). */
    public long discountOn(long subtotal) {
        if (subtotal <= 0) {
            return 0;
        }
        long off;
        if (discountType == DiscountType.PERCENT) {
            off = BigDecimal.valueOf(subtotal).multiply(BigDecimal.valueOf(discountValue))
                    .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValueExact();
            if (maxDiscountHalalas != null) {
                off = Math.min(off, maxDiscountHalalas);
            }
        } else {
            off = discountValue;
        }
        return Math.min(off, subtotal);
    }

    /** Within its dates (and switched on) at {@code now}. */
    public boolean liveAt(Instant now) {
        return active && (startsAt == null || !startsAt.isAfter(now)) && (endsAt == null || endsAt.isAfter(now));
    }

    public String getCode() {
        return code;
    }

    public String getTitle() {
        return title;
    }

    public String getTitleEn() {
        return titleEn;
    }

    public DiscountType getDiscountType() {
        return discountType;
    }

    public long getDiscountValue() {
        return discountValue;
    }

    public Long getMaxDiscountHalalas() {
        return maxDiscountHalalas;
    }

    public long getMinSubtotalHalalas() {
        return minSubtotalHalalas;
    }

    public Instant getStartsAt() {
        return startsAt;
    }

    public Instant getEndsAt() {
        return endsAt;
    }

    public Integer getUsageLimit() {
        return usageLimit;
    }

    public Integer getPerCustomerLimit() {
        return perCustomerLimit;
    }

    public boolean isFirstBookingOnly() {
        return firstBookingOnly;
    }

    public boolean isActive() {
        return active;
    }

    public boolean isAnnounce() {
        return announce;
    }
}
