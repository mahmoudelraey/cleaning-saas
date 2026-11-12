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

    /** Arabic (main) name: invoices, messages and everything in Arabic use it. */
    @Column(nullable = false)
    private String name;

    /** English name; may be empty for companies created before it was asked for. */
    @Column(name = "name_en")
    private String nameEn;

    @Column(nullable = false, unique = true)
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

    // Public page in the customer portal (see PublicPage).
    @Column(name = "page_headline")
    private String pageHeadline;

    @Column(name = "page_about")
    private String pageAbout;

    @Column(name = "page_headline_en")
    private String pageHeadlineEn;

    @Column(name = "page_about_en")
    private String pageAboutEn;

    @Column(name = "page_promises_en")
    private String pagePromisesEn;

    @Column(name = "page_areas_en")
    private String pageAreasEn;

    @Column(name = "page_hours_en")
    private String pageHoursEn;

    @Column(name = "page_hero_title")
    private String pageHeroTitle;

    @Column(name = "page_hero_title_en")
    private String pageHeroTitleEn;

    /** English address for the portal (invoices keep the Arabic {@link #address}). */
    @Column(name = "address_en")
    private String addressEn;

    @Column(name = "page_areas")
    private String pageAreas;

    @Column(name = "page_hours")
    private String pageHours;

    /** Saudi mobile in E.164, used for the WhatsApp button. */
    private String whatsapp;

    private String instagram;

    @Column(name = "x_handle")
    private String xHandle;

    private String snapchat;

    private String tiktok;

    /** Facebook page name, or digits for a profile.php?id= page. */
    private String facebook;

    @Column(name = "page_founded_year")
    private Short pageFoundedYear;

    @Column(name = "page_team_size")
    private Integer pageTeamSize;

    /** "What you can expect" on the About us page, one per line. */
    @Column(name = "page_promises")
    private String pagePromises;

    /** Google Maps listing (Places API ID). Only the ID is stored; ratings are fetched live. */
    @Column(name = "google_place_id")
    private String googlePlaceId;

    @Column(name = "google_place_name")
    private String googlePlaceName;

    /** The tenant holding the platform owner's account; never a real company. */
    @Column(nullable = false, insertable = false, updatable = false)
    private boolean platform;

    @Column(name = "billing_cycle")
    private String billingCycle;

    /** End of the paid period (manual activation by the platform owner until online payment exists). */
    @Column(name = "paid_until")
    private Instant paidUntil;

    /** Why the platform owner suspended / changed the subscription (shown in the console). */
    @Column(name = "status_note")
    private String statusNote;

    protected Tenant() {
    }

    // ---- subscription changes made by the platform owner -----------------------------------------

    public void changePlan(String planId) {
        this.planId = planId;
    }

    /** Starts or extends a trial until {@code end} (ending it now = an end in the past: the company is blocked). */
    public void setTrialEnd(Instant end) {
        this.status = TenantStatus.TRIAL;
        this.trialEndsAt = end;
    }

    /** Paid subscription until {@code paidUntil}; {@code cycle} MONTHLY or YEARLY. */
    public void activate(String planId, String cycle, Instant paidUntil) {
        this.planId = planId;
        this.billingCycle = cycle;
        this.paidUntil = paidUntil;
        this.status = TenantStatus.ACTIVE;
        this.statusNote = null;
    }

    /** Paid period over: still usable during the grace period. */
    public void markPastDue() {
        this.status = TenantStatus.PAST_DUE;
    }

    public void suspend(String note) {
        this.status = TenantStatus.SUSPENDED;
        this.statusNote = note;
    }

    public void cancel(String note) {
        this.status = TenantStatus.CANCELLED;
        this.statusNote = note;
    }

    public boolean isPlatform() {
        return platform;
    }

    public String getBillingCycle() {
        return billingCycle;
    }

    public Instant getPaidUntil() {
        return paidUntil;
    }

    public String getStatusNote() {
        return statusNote;
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

    public static Tenant startTrial(String name, String nameEn, String slug, String planId, String timezone,
                                    Instant trialEndsAt) {
        Tenant t = startTrial(name, slug, planId, timezone, trialEndsAt);
        t.nameEn = nameEn;
        return t;
    }

    public void renameEn(String nameEn) {
        this.nameEn = nameEn;
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

    /** The company link. Validated and checked for uniqueness by TenantService. */
    public void changeSlug(String slug) {
        this.slug = slug;
    }

    public void updateBookingPage(boolean enabled, String note) {
        this.bookingPageEnabled = enabled;
        this.bookingPageNote = note;
    }

    /** The page's text and facts. Contact details are saved separately ({@link #updateContact}). */
    public void updatePublicPage(PublicPage p) {
        this.pageHeadline = p.headline();
        this.pageAbout = p.about();
        this.pageAreas = p.areas();
        this.pageHours = p.hours();
        this.pageFoundedYear = p.foundedYear() == null ? null : p.foundedYear().shortValue();
        this.pageTeamSize = p.teamSize();
        this.pagePromises = p.promises();
        this.pageHeadlineEn = p.headlineEn();
        this.pageAboutEn = p.aboutEn();
        this.pagePromisesEn = p.promisesEn();
        this.pageAreasEn = p.areasEn();
        this.pageHoursEn = p.hoursEn();
        this.pageHeroTitle = p.heroTitle();
        this.pageHeroTitleEn = p.heroTitleEn();
    }

    public void setAddressEn(String addressEn) {
        this.addressEn = addressEn;
    }

    public String getAddressEn() {
        return addressEn;
    }

    /** How customers reach the company: mobile, WhatsApp and social accounts (shown on the portal). */
    public void updateContact(String phone, String whatsapp, String facebook, String instagram, String tiktok,
                              String snapchat, String x) {
        this.phone = phone;
        this.whatsapp = whatsapp;
        this.facebook = facebook;
        this.instagram = instagram;
        this.tiktok = tiktok;
        this.snapchat = snapchat;
        this.xHandle = x;
    }

    public void connectGoogle(String placeId, String placeName) {
        this.googlePlaceId = placeId;
        this.googlePlaceName = placeId == null ? null : placeName;
    }

    public String getGooglePlaceId() {
        return googlePlaceId;
    }

    public String getGooglePlaceName() {
        return googlePlaceName;
    }

    public PublicPage getPublicPage() {
        return new PublicPage(pageHeadline, pageAbout, pageAreas, pageHours, whatsapp, instagram, xHandle, snapchat,
                tiktok, pageFoundedYear == null ? null : pageFoundedYear.intValue(), pageTeamSize, pagePromises, facebook,
                pageHeadlineEn, pageAboutEn, pagePromisesEn, pageAreasEn, pageHoursEn, pageHeroTitle, pageHeroTitleEn);
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

    public String getNameEn() {
        return nameEn;
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
