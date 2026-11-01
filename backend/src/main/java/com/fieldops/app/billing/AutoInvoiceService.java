package com.fieldops.app.billing;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingRepository;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Issues the invoices for completed visits flagged {@code invoice_state = PENDING}. Run by
 * {@link BillingJobs}; idempotent and restart-safe: the flag is committed with the completion, each
 * booking is handled in its own transaction, a booking that already has an invoice is just marked done,
 * and failures are retried with backoff (then left FAILED for the office to issue manually).
 */
@Service
public class AutoInvoiceService {

    private static final Logger log = LoggerFactory.getLogger(AutoInvoiceService.class);
    static final int BATCH = 50;
    static final int MAX_ATTEMPTS = 5;

    private final BillingService billing;
    private final BookingRepository bookings;
    private final InvoiceRepository invoices;
    private final TenantRepository tenants;
    private final TransactionTemplate tx;
    private final Clock clock;

    public AutoInvoiceService(BillingService billing, BookingRepository bookings, InvoiceRepository invoices,
                              TenantRepository tenants, PlatformTransactionManager txManager, Clock clock) {
        this.billing = billing;
        this.bookings = bookings;
        this.invoices = invoices;
        this.tenants = tenants;
        this.tx = new TransactionTemplate(txManager);
        this.clock = clock;
    }

    /** All companies. Returns the number of invoices issued. */
    public int processAll() {
        int issued = 0;
        Instant now = Instant.now(clock);
        for (Tenant t : tenants.findAll()) {
            if (t.isUsable(now)) {
                issued += processTenant(t.getId());
            }
        }
        return issued;
    }

    public int processTenant(UUID tenantId) {
        return TenantContext.runAs(tenantId, () -> {
            List<UUID> due = tx.execute(s -> bookings.findInvoiceDue(Booking.InvoiceState.PENDING, Instant.now(clock),
                    PageRequest.of(0, BATCH)));
            int issued = 0;
            for (UUID id : due == null ? List.<UUID>of() : due) {
                if (processOne(id)) {
                    issued++;
                }
            }
            return issued;
        });
    }

    private boolean processOne(UUID bookingId) {
        try {
            Boolean issued = tx.execute(s -> {
                Booking b = bookings.findById(bookingId).orElse(null);
                if (b == null || b.getInvoiceState() != Booking.InvoiceState.PENDING) {
                    return false;
                }
                if (invoices.findLiveForBooking(bookingId, Invoice.Status.VOID).isPresent()) {
                    b.invoiceIssued(); // issued manually meanwhile
                    return false;
                }
                billing.issueFromBooking(bookingId, new BillingService.FromBookingCommand(0, null, null, null, true));
                return true;
            });
            return Boolean.TRUE.equals(issued);
        } catch (RuntimeException e) {
            // The failed transaction rolled back; record the attempt in a fresh one.
            log.warn("Automatic invoice for booking {} failed: {}", bookingId, e.getMessage());
            tx.executeWithoutResult(s -> bookings.findById(bookingId)
                    .ifPresent(b -> b.invoiceFailed(e.getMessage(), Instant.now(clock), MAX_ATTEMPTS)));
            return false;
        }
    }
}
