package com.fieldops.portal.invoice;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fieldops.app.billing.BillingDtos;
import com.fieldops.app.billing.BillingPdfService;
import com.fieldops.app.billing.BillingService;
import com.fieldops.app.billing.Invoice;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.customerportal.CustomerPortalService;
import com.fieldops.portal.db.TenantJdbc;
import com.fieldops.portal.security.CurrentCustomer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The customer's invoices: the list, one invoice shown in the portal, and its PDF. */
@RestController
@RequestMapping("/api/portal/{slug}/invoices")
public class InvoiceController {

    private final TenantJdbc db;
    private final CustomerPortalService portal;
    private final BillingService billing;
    private final BillingPdfService pdfs;

    public InvoiceController(TenantJdbc db, CustomerPortalService portal, BillingService billing,
                             BillingPdfService pdfs) {
        this.db = db;
        this.portal = portal;
        this.billing = billing;
        this.pdfs = pdfs;
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

    /** One of the customer's invoices, shown on the portal's invoice page. */
    @GetMapping("/{id}")
    public BillingDtos.InvoiceDto get(@PathVariable String slug, @PathVariable UUID id) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return TenantContext.runAs(me.tenantId(), () -> {
            BillingService.InvoiceDetail d = billing.invoiceDetail(id);
            mine(d.invoice(), me);
            return BillingDtos.InvoiceDto.of(d.invoice(), d.payments(), null);
        });
    }

    /** The invoice PDF (same design as the office downloads), for the customer's own invoice. */
    @GetMapping("/{id}/pdf")
    public ResponseEntity<byte[]> pdf(@PathVariable String slug, @PathVariable UUID id) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return TenantContext.runAs(me.tenantId(), () -> {
            Invoice inv = billing.getInvoice(id);
            mine(inv, me);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_PDF)
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"INV-" + inv.getNumber() + ".pdf\"")
                    .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                    .body(pdfs.invoicePdf(id));
        });
    }

    private static void mine(Invoice inv, CurrentCustomer me) {
        if (!me.customerId().equals(inv.getCustomerId())) {
            throw ApiException.notFound("invoice");
        }
    }

    @PostMapping("/{id}/link")
    public LinkDto link(@PathVariable String slug, @PathVariable UUID id) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return new LinkDto(portal.invoiceLink(slug, me.customerId(), id));
    }

    public record LinkDto(String url) {
    }
}
