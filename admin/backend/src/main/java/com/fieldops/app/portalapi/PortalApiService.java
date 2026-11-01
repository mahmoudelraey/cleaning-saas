package com.fieldops.app.portalapi;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import com.fieldops.app.billing.BillingService;
import com.fieldops.app.billing.InvoiceRepository;
import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingPricing;
import com.fieldops.app.booking.BookingService;
import com.fieldops.app.booking.BookingSource;
import com.fieldops.app.booking.CalendarService;
import com.fieldops.app.booking.PaymentMethod;
import com.fieldops.app.catalog.CatalogService;
import com.fieldops.app.catalog.ServiceOffering;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.customer.Address;
import com.fieldops.app.customer.Customer;
import com.fieldops.app.customer.CustomerRepository;
import com.fieldops.app.customer.CustomerService;
import com.fieldops.app.publicpage.OtpService;
import com.fieldops.app.scheduling.SchedulingService;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Business operations the customer portal is allowed to perform, always for one tenant and one customer. */
@Service
public class PortalApiService {

    /** Customers can cancel online until this long before the visit. */
    public static final Duration CANCEL_NOTICE = Duration.ofHours(6);
    public static final int MAX_DAYS_AHEAD = 60;

    private final TenantService tenants;
    private final OtpService otp;
    private final CustomerService customers;
    private final CustomerRepository customerRepo;
    private final CatalogService catalog;
    private final BookingPricing pricing;
    private final CalendarService calendar;
    private final BookingService bookings;
    private final BillingService billing;
    private final InvoiceRepository invoices;
    private final TransactionTemplate tx;
    private final Clock clock;

    public PortalApiService(TenantService tenants, OtpService otp, CustomerService customers,
                            CustomerRepository customerRepo, CatalogService catalog, BookingPricing pricing,
                            CalendarService calendar, BookingService bookings, BillingService billing,
                            InvoiceRepository invoices, TransactionTemplate tx, Clock clock) {
        this.tenants = tenants;
        this.otp = otp;
        this.customers = customers;
        this.customerRepo = customerRepo;
        this.catalog = catalog;
        this.pricing = pricing;
        this.calendar = calendar;
        this.bookings = bookings;
        this.billing = billing;
        this.invoices = invoices;
        this.tx = tx;
        this.clock = clock;
    }

    public record Identity(String phone, UUID customerId, String customerName) {
    }

    public record AddressInput(String city, String district, String details, BigDecimal lat, BigDecimal lng,
                               String mapUrl, Integer cityId, Long districtId) {
    }

    public record NewBooking(List<BookingPricing.Line> items, Instant scheduledStart, UUID addressId, AddressInput address,
                             String notes, PaymentMethod paymentMethod) {
    }

    // --- company ------------------------------------------------------------------------------------

    /** The company behind a portal link; only companies whose subscription is usable. */
    public Tenant company(String slug) {
        return tenants.bySlug(slug);
    }

    public boolean bookingOpen(Tenant t) {
        return t.isBookingPageEnabled() && tenants.hasFeature(t, PlanFeature.BOOKING_PAGE);
    }

    // --- sign-in --------------------------------------------------------------------------------------

    public OtpService.Sent sendCode(String slug, String rawPhone) {
        Tenant t = company(slug);
        String phone = phone(rawPhone);
        return as(t, () -> otp.send(t, phone));
    }

    /** Checks the code and tells the portal who this is (customerId is null for a first-time visitor). */
    public Identity verify(String slug, String rawPhone, String code) {
        Tenant t = company(slug);
        String phone = phone(rawPhone);
        // verify() records wrong attempts in its own transaction, so it must not run inside ours.
        String session = as(t, () -> otp.verify(phone, code));
        return as(t, () -> tx.execute(s -> {
            otp.consume(session); // a portal sign-in uses the verification right away
            Optional<Customer> c = customerRepo.findByPhone(phone);
            return new Identity(phone, c.map(Customer::getId).orElse(null), c.map(Customer::getName).orElse(null));
        }));
    }

    /** First visit: create the customer record (or return the existing one for that mobile). */
    public Customer register(String slug, String rawPhone, String name) {
        Tenant t = company(slug);
        String phone = phone(rawPhone);
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty() || clean.length() > 150) {
            throw ApiException.badRequest("name_required", "Enter your name");
        }
        return as(t, () -> customers.findOrCreateByPhone(clean, phone));
    }

    public Customer rename(String slug, UUID customerId, String name, String email) {
        Tenant t = company(slug);
        String clean = name == null ? "" : name.trim();
        if (clean.isEmpty() || clean.length() > 150) {
            throw ApiException.badRequest("name_required", "Enter your name");
        }
        return as(t, () -> {
            Customer c = customers.get(customerId);
            return customers.update(customerId, new CustomerService.CustomerData(clean, c.getPhone(),
                    email == null || email.isBlank() ? null : email.trim(), c.getNotes()));
        });
    }

    // --- booking --------------------------------------------------------------------------------------

    public List<ServiceOffering> services(String slug) {
        Tenant t = company(slug);
        return as(t, () -> catalog.list(true));
    }

    public BookingPricing.Priced quote(String slug, List<BookingPricing.Line> items) {
        Tenant t = company(slug);
        return as(t, () -> pricing.price(items));
    }

    public List<SchedulingService.Slot> availability(String slug, LocalDate date, List<BookingPricing.Line> items) {
        Tenant t = openForBooking(slug);
        ZoneId zone = ZoneId.of(t.getTimezone());
        LocalDate today = LocalDate.now(clock.withZone(zone));
        if (date == null || date.isBefore(today) || date.isAfter(today.plusDays(MAX_DAYS_AHEAD))) {
            return List.of();
        }
        return as(t, () -> calendar.availability(date, pricing.price(items).durationMin(), zone, true));
    }

    /** Creates a NEW booking for a signed-in customer (the office confirms it, as with the booking page). */
    public Booking book(String slug, UUID customerId, NewBooking req) {
        Tenant t = openForBooking(slug);
        ZoneId zone = ZoneId.of(t.getTimezone());
        if (req.scheduledStart() == null) {
            throw ApiException.badRequest("schedule_required", "Choose a time");
        }
        return as(t, () -> tx.execute(s -> {
            Customer c = customers.get(customerId);
            BookingPricing.Priced priced = pricing.price(req.items());
            LocalDate date = LocalDate.ofInstant(req.scheduledStart(), zone);
            boolean free = calendar.availability(date, priced.durationMin(), zone, true).stream()
                    .anyMatch(slot -> slot.start().equals(req.scheduledStart()));
            if (!free) {
                throw ApiException.conflict("slot_unavailable", "This time is no longer available. Choose another one");
            }
            UUID addressId = req.addressId();
            if (addressId != null && c.getAddresses().stream().noneMatch(a -> a.getId().equals(req.addressId()))) {
                throw ApiException.notFound("address");
            }
            AddressInput a = req.address();
            if (addressId == null && a != null && (notBlank(a.city()) || notBlank(a.district()) || notBlank(a.details())
                    || a.lat() != null || a.cityId() != null || a.districtId() != null)) {
                Address saved = customers.addAddress(c.getId(), new CustomerService.AddressData(
                        "عنوان " + LocalDate.now(clock.withZone(zone)), cut(a.city(), 80), cut(a.district(), 80),
                        cut(a.details(), 300), a.lat(), a.lng(), safeMapUrl(a.mapUrl()), a.cityId(), a.districtId()));
                addressId = saved.getId();
            }
            return bookings.create(new BookingService.BookingCommand(c.getId(), addressId, req.scheduledStart(), null,
                    req.items(), cut(req.notes(), 1000), null, req.paymentMethod()), BookingSource.PORTAL, List.of(), false);
        }));
    }

    public Booking cancel(String slug, UUID customerId, UUID bookingId, String reason) {
        Tenant t = company(slug);
        return as(t, () -> bookings.cancelByCustomer(bookingId, customerId, cut(reason, 500), CANCEL_NOTICE));
    }

    /** Share link of the customer's own invoice (opens the existing public invoice page). */
    public String invoiceLink(String slug, UUID customerId, UUID invoiceId) {
        Tenant t = company(slug);
        return as(t, () -> {
            boolean mine = invoices.findById(invoiceId).map(i -> customerId.equals(i.getCustomerId())).orElse(false);
            if (!mine) {
                throw ApiException.notFound("invoice");
            }
            return billing.invoiceLink(invoiceId);
        });
    }

    // ---------------------------------------------------------------------------------------------

    private Tenant openForBooking(String slug) {
        Tenant t = company(slug);
        if (!bookingOpen(t)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "booking_closed", "This company isn't taking online bookings");
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

    private static String safeMapUrl(String url) {
        String u = cut(url, 500);
        return u != null && u.startsWith("https://") ? u : null;
    }
}
