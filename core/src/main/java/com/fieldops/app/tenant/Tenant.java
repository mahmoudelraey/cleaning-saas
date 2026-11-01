package com.fieldops.app.tenant;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.BaseEntity;

/** A subscribing company. The root of isolation, so it is not itself tenant-scoped. */
@Entity
@Table(name = "tenants")
public class Tenant extends BaseEntity {

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true, updatable = false)
    private String slug;

    @Column(name = "logo_url")
    private String logoUrl;

    private String phone;

    @Column(name = "vat_number")
    private String vatNumber;

    @Column(nullable = false)
    private String timezone;

    @Column(name = "plan_id", nullable = false)
    private String planId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TenantStatus status;

    @Column(name = "trial_ends_at")
    private Instant trialEndsAt;

    @Column(name = "notify_confirmation", nullable = false)
    private boolean notifyConfirmation = true;

    @Column(name = "notify_reminder", nullable = false)
    private boolean notifyReminder = true;

    @Column(name = "notify_on_the_way", nullable = false)
    private boolean notifyOnTheWay = true;

    @Column(name = "notify_completed", nullable = false)
    private boolean notifyCompleted = true;

    @Column(name = "notify_cancelled", nullable = false)
    private boolean notifyCancelled = true;

    @Column(name = "reminder_hours", nullable = false)
    private int reminderHours = 3;

    private String address;

    @Column(name = "commercial_registration")
    private String commercialRegistration;

    /** Storage key of the uploaded logo (JPEG/PNG), served publicly by slug. */
    @Column(name = "logo_key")
    private String logoKey;

    /** Catalog prices already include 15% VAT (common for consumer pricing). */
    @Column(name = "prices_include_vat", nullable = false)
    private boolean pricesIncludeVat;

    /** Issue and send the invoice automatically when a visit is completed. */
    @Column(name = "auto_invoice", nullable = false)
    private boolean autoInvoice = true;

    @Column(name = "booking_page_enabled", nullable = false)
    private boolean bookingPageEnabled = true;

    /** Short message shown at the top of the public booking page. */
    @Column(name = "booking_page_note")
    private String bookingPageNote;

    protected Tenant() {
    }

    public static Tenant startTrial(String name, String slug, String planId, String timezone, Instant trialEndsAt) {
        Tenant t = new Tenant();
        t.name = name;
        t.slug = slug;
        t.planId = planId;
        t.timezone = timezone;
        t.status = TenantStatus.TRIAL;
        t.trialEndsAt = trialEndsAt;
        return t;
    }

    public void updateProfile(String name, String phone, String vatNumber, String address,
                              String commercialRegistration, boolean pricesIncludeVat, boolean autoInvoice) {
        this.autoInvoice = autoInvoice;
        this.name = name;
        this.phone = phone;
        this.vatNumber = vatNumber;
        this.address = address;
        this.commercialRegistration = commercialRegistration;
        this.pricesIncludeVat = pricesIncludeVat;
    }

    /** @return the previous key (to delete from storage), or null. */
    public String replaceLogo(String key) {
        String old = this.logoKey;
        this.logoKey = key;
        this.logoUrl = null;
        return old;
    }

    public void updateBookingPage(boolean enabled, String note) {
        this.bookingPageEnabled = enabled;
        this.bookingPageNote = note;
    }

    public boolean isAutoInvoice() {
        return autoInvoice;
    }

    public boolean isBookingPageEnabled() {
        return bookingPageEnabled;
    }

    public String getBookingPageNote() {
        return bookingPageNote;
    }

    public boolean isVatRegistered() {
        return vatNumber != null && !vatNumber.isBlank();
    }

    public String getAddress() {
        return address;
    }

    public String getCommercialRegistration() {
        return commercialRegistration;
    }

    public String getLogoKey() {
        return logoKey;
    }

    public boolean isPricesIncludeVat() {
        return pricesIncludeVat;
    }

    public void updateNotificationSettings(boolean confirmation, boolean reminder, boolean onTheWay,
                                           boolean completed, boolean cancelled, int reminderHours) {
        this.notifyConfirmation = confirmation;
        this.notifyReminder = reminder;
        this.notifyOnTheWay = onTheWay;
        this.notifyCompleted = completed;
        this.notifyCancelled = cancelled;
        this.reminderHours = reminderHours;
    }

    public boolean isNotifyConfirmation() {
        return notifyConfirmation;
    }

    public boolean isNotifyReminder() {
        return notifyReminder;
    }

    public boolean isNotifyOnTheWay() {
        return notifyOnTheWay;
    }

    public boolean isNotifyCompleted() {
        return notifyCompleted;
    }

    public boolean isNotifyCancelled() {
        return notifyCancelled;
    }

    public int getReminderHours() {
        return reminderHours;
    }

    /** Can staff of this tenant use the app right now? */
    public boolean isUsable(Instant now) {
        return switch (status) {
            case ACTIVE, PAST_DUE -> true;
            // Fail closed: a trial without an end date is treated as expired, never as unlimited.
            case TRIAL -> trialEndsAt != null && now.isBefore(trialEndsAt);
            case SUSPENDED, CANCELLED -> false;
        };
    }

    public String getName() {
        return name;
    }

    public String getSlug() {
        return slug;
    }

    /** Public, cache-busted URL of the uploaded logo (the key changes on every upload). */
    public String getLogoUrl() {
        if (logoKey == null) {
            return null;
        }
        String file = logoKey.substring(logoKey.lastIndexOf('/') + 1);
        int dot = file.indexOf('.');
        return "/api/v1/public/tenants/" + slug + "/logo?v=" + (dot > 0 ? file.substring(0, dot) : file);
    }

    public String getPhone() {
        return phone;
    }

    public String getVatNumber() {
        return vatNumber;
    }

    public String getTimezone() {
        return timezone;
    }

    public String getPlanId() {
        return planId;
    }

    public TenantStatus getStatus() {
        return status;
    }

    public Instant getTrialEndsAt() {
        return trialEndsAt;
    }
}
