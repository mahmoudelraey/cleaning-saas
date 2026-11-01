package com.fieldops.portal.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Shapes of the admin backend's internal portal API (see admin PortalApiController). */
public final class AdminDtos {

    private AdminDtos() {
    }

    public record Company(UUID tenantId, String name, String slug, String logoUrl, String phone, String timezone,
                          boolean bookingOpen, boolean vatRegistered, boolean pricesIncludeVat, int maxDaysAhead,
                          int leadTimeHours, int cancelNoticeHours) {
    }

    public record Otp(Instant expiresAt, int resendAfterSeconds, String devCode) {
    }

    public record Identity(String phone, UUID customerId, String customerName) {
    }

    public record Customer(UUID id, String name, String phone, String email) {
    }

    public record Addon(UUID id, String name, long priceHalalas) {
    }

    public record Service(UUID id, String name, String description, String pricingType, long basePriceHalalas,
                          int durationMin, List<Addon> addons) {
    }

    public record Item(UUID serviceId, BigDecimal quantity, List<UUID> addonIds) {
    }

    public record QuoteItem(String description, BigDecimal quantity, long totalHalalas) {
    }

    public record Quote(List<QuoteItem> items, long subtotalHalalas, int durationMin) {
    }

    public record Slot(Instant start, Instant end) {
    }

    public record Address(String city, String district, String details, BigDecimal lat, BigDecimal lng, String mapUrl,
                          Integer cityId, Long districtId) {
    }

    public record Booked(UUID id, long number, String status, Instant scheduledStart, Instant scheduledEnd,
                         long subtotalHalalas) {
    }

    public record Link(String url) {
    }

    // requests
    public record PhoneBody(String phone) {
    }

    public record VerifyBody(String phone, String code) {
    }

    public record RegisterBody(String phone, String name) {
    }

    public record ProfileBody(String name, String email) {
    }

    public record ItemsBody(List<Item> items) {
    }

    public record AvailabilityBody(LocalDate date, List<Item> items) {
    }

    public record BookBody(List<Item> items, Instant scheduledStart, UUID addressId, Address address, String notes,
                           String paymentMethod) {
    }

    public record CancelBody(String reason) {
    }
}
