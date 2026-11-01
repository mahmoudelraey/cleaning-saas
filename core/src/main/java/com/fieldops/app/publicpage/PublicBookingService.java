package com.fieldops.app.publicpage;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingPricing;
import com.fieldops.app.booking.BookingService;
import com.fieldops.app.booking.BookingSource;
import com.fieldops.app.booking.CalendarService;
import com.fieldops.app.catalog.CatalogService;
import com.fieldops.app.catalog.ServiceOffering;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.customer.Address;
import com.fieldops.app.customer.Customer;
import com.fieldops.app.customer.CustomerService;
import com.fieldops.app.scheduling.SchedulingService;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Everything behind /book/{slug}. The slug picks the tenant (only usable companies with the page
 * enabled); every step then runs as that tenant, so RLS applies exactly as for staff. Prices and
 * durations always come from the catalog; the client only sends service ids and quantities.
 */
@Service
public class PublicBookingService {

    public static final int MAX_DAYS_AHEAD = 60;

    private final TenantService tenants;
    private final CatalogService catalog;
    private final CalendarService calendar;
    private final BookingPricing pricing;
    private final BookingService bookings;
    private final CustomerService customers;
    private final OtpService otp;
    private final TransactionTemplate tx;
    private final Clock clock;

    public PublicBookingService(TenantService tenants, CatalogService catalog, CalendarService calendar,
                                BookingPricing pricing, BookingService bookings, CustomerService customers,
                                OtpService otp, TransactionTemplate tx, Clock clock) {
        this.tenants = tenants;
        this.catalog = catalog;
        this.calendar = calendar;
        this.pricing = pricing;
        this.bookings = bookings;
        this.customers = customers;
        this.otp = otp;
        this.tx = tx;
        this.clock = clock;
    }

    public record Page(Tenant tenant, List<ServiceOffering> services) {
    }

    public record AddressInput(String city, String district, String details, java.math.BigDecimal lat,
                               java.math.BigDecimal lng, String mapUrl, Integer cityId, Long districtId) {
    }

    public record BookingRequest(String sessionToken, String name, List<BookingPricing.Line> items,
                                 Instant scheduledStart, AddressInput address, String notes) {
    }

    public Page page(String slug) {
        Tenant t = open(slug);
        return as(t, () -> new Page(t, catalog.list(true)));
    }

    public BookingPricing.Priced quote(String slug, List<BookingPricing.Line> items) {
        Tenant t = open(slug);
        return as(t, () -> pricing.price(items));
    }

    public List<SchedulingService.Slot> availability(String slug, LocalDate date, List<BookingPricing.Line> items) {
        Tenant t = open(slug);
        ZoneId zone = ZoneId.of(t.getTimezone());
        LocalDate today = LocalDate.now(clock.withZone(zone));
        if (date == null || date.isBefore(today) || date.isAfter(today.plusDays(MAX_DAYS_AHEAD))) {
            return List.of();
        }
        return as(t, () -> {
            int duration = pricing.price(items).durationMin();
            return calendar.availability(date, duration, zone, true);
        });
    }

    public OtpService.Sent sendCode(String slug, String rawPhone) {
        Tenant t = open(slug);
        String phone = phone(rawPhone);
        return as(t, () -> otp.send(t, phone));
    }

    public String verifyCode(String slug, String rawPhone, String code) {
        Tenant t = open(slug);
        String phone = phone(rawPhone);
        return as(t, () -> otp.verify(phone, code));
    }

    /** Creates the booking (status NEW, the office confirms). One verified session = one booking. */
    public Booking book(String slug, BookingRequest req) {
        Tenant t = open(slug);
        ZoneId zone = ZoneId.of(t.getTimezone());
        if (req.name() == null || req.name().isBlank() || req.name().trim().length() > 150) {
            throw ApiException.badRequest("name_required", "Enter your name");
        }
        if (req.scheduledStart() == null) {
            throw ApiException.badRequest("schedule_required", "Choose a time");
        }
        return as(t, () -> tx.execute(status -> {
            String phone = otp.consume(req.sessionToken());
            BookingPricing.Priced priced = pricing.price(req.items());
            LocalDate date = LocalDate.ofInstant(req.scheduledStart(), zone);
            boolean open = calendar.availability(date, priced.durationMin(), zone, true).stream()
                    .anyMatch(s -> s.start().equals(req.scheduledStart()));
            if (!open) {
                throw ApiException.conflict("slot_unavailable", "This time is no longer available. Choose another one");
            }

            Customer c = customers.findOrCreateByPhone(req.name(), phone);
            UUID addressId = null;
            AddressInput a = req.address();
            if (a != null && (notBlank(a.city()) || notBlank(a.district()) || notBlank(a.details()) || a.lat() != null
                    || a.cityId() != null || a.districtId() != null)) {
                Address saved = customers.addAddress(c.getId(), new CustomerService.AddressData(
                        "الحجز " + LocalDate.now(clock.withZone(zone)), cut(a.city(), 80), cut(a.district(), 80),
                        cut(a.details(), 300), a.lat(), a.lng(), safeMapUrl(a.mapUrl()), a.cityId(), a.districtId()));
                addressId = saved.getId();
            }
            return bookings.create(new BookingService.BookingCommand(c.getId(), addressId, req.scheduledStart(), null,
                    req.items(), cut(req.notes(), 1000), null, null), BookingSource.PUBLIC_PAGE, List.of(), false);
        }));
    }

    // ---------------------------------------------------------------------------------------------

    private Tenant open(String slug) {
        Tenant t = tenants.bySlug(slug);
        if (!t.isBookingPageEnabled() || !tenants.hasFeature(t, PlanFeature.BOOKING_PAGE)) {
            throw ApiException.notFound("tenant");
        }
        return t;
    }

    private static <T> T as(Tenant t, Supplier<T> work) {
        return TenantContext.runAs(t.getId(), work);
    }

    private static String phone(String raw) {
        return PhoneNumbers.normalizeSaudiMobile(raw == null ? "" : raw)
                .orElseThrow(() -> ApiException.badRequest("invalid_phone", "Enter a Saudi mobile number (05XXXXXXXX)"));
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String cut(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    /** Only https map links (Google Maps share links); anything else is dropped. */
    private static String safeMapUrl(String url) {
        String u = cut(url, 500);
        return u != null && u.startsWith("https://") ? u : null;
    }
}
