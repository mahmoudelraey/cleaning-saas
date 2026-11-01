package com.fieldops.portal.invoice;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fieldops.app.customerportal.CustomerPortalService;
import com.fieldops.portal.db.TenantJdbc;
import com.fieldops.portal.security.CurrentCustomer;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The customer's invoices; opening one uses the existing public invoice page (PDF, QR, payments). */
@RestController
@RequestMapping("/api/portal/{slug}/invoices")
public class InvoiceController {

    private final TenantJdbc db;
    private final CustomerPortalService portal;

    public InvoiceController(TenantJdbc db, CustomerPortalService portal) {
        this.db = db;
        this.portal = portal;
    }

    public record InvoiceRow(UUID id, long number, UUID bookingId, Long bookingNumber, Instant issuedAt, String status,
                             long totalHalalas, long paidHalalas) {
    }

    @GetMapping
    public List<InvoiceRow> list(@PathVariable String slug) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return db.read(me.tenantId(), q -> q.query("""
                select i.id, i.number, i.booking_id, b.number as booking_number, i.issued_at, i.status,
                       i.total_halalas, i.paid_halalas
                from invoices i left join bookings b on b.id = i.booking_id
                where i.tenant_id = :t and i.customer_id = :c
                order by i.issued_at desc limit 100
                """, Map.of("t", me.tenantId(), "c", me.customerId()), (rs, i) -> new InvoiceRow(
                rs.getObject("id", UUID.class), rs.getLong("number"), rs.getObject("booking_id", UUID.class),
                (Long) rs.getObject("booking_number"), rs.getTimestamp("issued_at").toInstant(), rs.getString("status"),
                rs.getLong("total_halalas"), rs.getLong("paid_halalas"))));
    }

    @PostMapping("/{id}/link")
    public LinkDto link(@PathVariable String slug, @PathVariable UUID id) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return new LinkDto(portal.invoiceLink(slug, me.customerId(), id));
    }

    public record LinkDto(String url) {
    }
}
