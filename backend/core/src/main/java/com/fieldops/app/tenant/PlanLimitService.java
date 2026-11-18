package com.fieldops.app.tenant;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import com.fieldops.app.booking.BookingRepository;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.notification.NotificationRepository;
import com.fieldops.app.notification.NotificationTemplate;
import com.fieldops.app.scheduling.TechnicianRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The numeric limits of a company's subscription: active technicians, automatic customer messages per month and
 * bookings per month. Each comes from the plan unless the platform admin set an override for that company
 * (Platform → Companies). A null monthly limit means unlimited. Months follow the company's time zone.
 */
@Service
public class PlanLimitService {

    /** Limits in effect; null = unlimited. */
    public record Limits(int maxTechnicians, Integer monthlyMessages, Integer monthlyBookings) {
    }

    /** This month so far (messages exclude OTP codes, which are never capped). */
    public record Usage(long activeTechnicians, long messagesThisMonth, long bookingsThisMonth) {
    }

    private final TenantRepository tenants;
    private final PlanRepository plans;
    private final BookingRepository bookings;
    private final TechnicianRepository technicians;
    private final NotificationRepository notifications;
    private final TransactionTemplate newTx;
    private final Clock clock;

    public PlanLimitService(TenantRepository tenants, PlanRepository plans, BookingRepository bookings,
                            TechnicianRepository technicians, NotificationRepository notifications,
                            PlatformTransactionManager txManager, Clock clock) {
        this.tenants = tenants;
        this.plans = plans;
        this.bookings = bookings;
        this.technicians = technicians;
        this.notifications = notifications;
        this.newTx = new TransactionTemplate(txManager);
        this.newTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.newTx.setReadOnly(true);
        this.clock = clock;
    }

    public Limits limits(Tenant t) {
        Plan p = plans.findById(t.getPlanId()).orElseThrow(() -> new IllegalStateException("No plan " + t.getPlanId()));
        return new Limits(
                t.getMaxTechniciansOverride() != null ? t.getMaxTechniciansOverride() : p.getMaxTechnicians(),
                t.getMonthlyMessagesOverride() != null ? t.getMonthlyMessagesOverride() : p.getMonthlyMessages(),
                t.getMonthlyBookingsOverride() != null ? t.getMonthlyBookingsOverride() : p.getMonthlyBookings());
    }

    public Limits limits(UUID tenantId) {
        return limits(tenant(tenantId));
    }

    /** First instant of the current calendar month in the company's time zone. */
    public Instant monthStart(Tenant t) {
        ZoneId zone = t.getTimezone() == null ? ZoneId.of("Asia/Riyadh") : ZoneId.of(t.getTimezone());
        return LocalDate.now(clock.withZone(zone)).withDayOfMonth(1).atStartOfDay(zone).toInstant();
    }

    public Instant monthStart(UUID tenantId) {
        return monthStart(tenant(tenantId));
    }

    /** Before adding (or re-activating) a technician. Runs in the company's context. */
    public void checkTechnicianAllowed() {
        int max = limits(TenantContext.require()).maxTechnicians();
        if (technicians.countByActiveTrue() >= max) {
            throw ApiException.conflict("plan_technician_limit",
                    "Your plan allows up to " + max + " active technicians");
        }
    }

    /** Before creating a booking (office, portal or public booking page). Runs in the company's context. */
    public void checkBookingAllowed() {
        Tenant t = tenant(TenantContext.require());
        Integer max = limits(t).monthlyBookings();
        if (max != null && bookings.countByCreatedAtGreaterThanEqual(monthStart(t)) >= max) {
            throw ApiException.conflict("plan_booking_limit",
                    "Your plan allows " + max + " bookings per month");
        }
    }

    /** This month's numbers for one company; usable from the platform console (no company context needed). */
    public Usage usage(UUID tenantId) {
        Instant from = monthStart(tenantId);
        return TenantContext.runAs(tenantId, () -> newTx.execute(s -> new Usage(
                technicians.countByActiveTrue(),
                notifications.countSentSince(from, NotificationTemplate.OTP),
                bookings.countByCreatedAtGreaterThanEqual(from))));
    }

    private Tenant tenant(UUID id) {
        return tenants.findById(id).orElseThrow(() -> ApiException.notFound("tenant"));
    }
}
