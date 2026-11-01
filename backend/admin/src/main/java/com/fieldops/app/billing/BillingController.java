package com.fieldops.app.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import com.fieldops.app.billing.BillingDtos.InvoiceDto;
import com.fieldops.app.billing.BillingDtos.InvoiceSummary;
import com.fieldops.app.billing.BillingDtos.LinkDto;
import com.fieldops.app.billing.BillingDtos.PaymentDto;
import com.fieldops.app.billing.BillingDtos.QuoteDto;
import com.fieldops.app.billing.BillingDtos.QuoteSummary;
import com.fieldops.app.common.web.PageResponse;
import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.RequiresFeature;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Office API for quotes, invoices and payments. Technicians have no access to money. */
@RestController
@RequestMapping("/api/v1")
@PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
@RequiresFeature(PlanFeature.QUOTES_INVOICES)
public class BillingController {

    private final BillingService billing;
    private final BillingPdfService pdfs;

    public BillingController(BillingService billing, BillingPdfService pdfs) {
        this.billing = billing;
        this.pdfs = pdfs;
    }

    // ---------------------------------------------------------------------------------------- invoices

    @GetMapping("/invoices")
    public PageResponse<InvoiceSummary> invoices(@RequestParam(required = false) String status,
                                                 @RequestParam(required = false) UUID customerId,
                                                 @RequestParam(defaultValue = "0") int page,
                                                 @RequestParam(defaultValue = "20") int size) {
        return PageResponse.of(billing.searchInvoices(status, customerId, pageRequest(page, size)), InvoiceSummary::of);
    }

    @GetMapping("/invoices/{id}")
    public InvoiceDto invoice(@PathVariable UUID id) {
        BillingService.InvoiceDetail d = billing.invoiceDetail(id);
        return InvoiceDto.of(d.invoice(), d.payments(), d.publicUrl());
    }

    @PostMapping("/invoices")
    @ResponseStatus(HttpStatus.CREATED)
    public InvoiceDto issue(@Valid @RequestBody IssueInvoiceRequest req) {
        Invoice inv = billing.issueStandalone(new BillingService.InvoiceCommand(req.customerId(), lines(req.lines()),
                req.discountHalalas() == null ? 0 : req.discountHalalas(), req.dueDate(), req.notes(),
                req.customerVatNumber(), Boolean.TRUE.equals(req.send())));
        return invoice(inv.getId());
    }

    @GetMapping("/bookings/{bookingId}/invoices")
    public List<InvoiceSummary> bookingInvoices(@PathVariable UUID bookingId) {
        return billing.invoicesForBooking(bookingId).stream().map(InvoiceSummary::of).toList();
    }

    @PostMapping("/bookings/{bookingId}/invoice")
    @ResponseStatus(HttpStatus.CREATED)
    public InvoiceDto issueForBooking(@PathVariable UUID bookingId, @Valid @RequestBody(required = false) FromBookingRequest req) {
        FromBookingRequest r = req == null ? new FromBookingRequest(null, null, null, null, null) : req;
        Invoice inv = billing.issueFromBooking(bookingId, new BillingService.FromBookingCommand(
                r.discountHalalas() == null ? 0 : r.discountHalalas(), r.dueDate(), r.notes(), r.customerVatNumber(),
                Boolean.TRUE.equals(r.send())));
        return invoice(inv.getId());
    }

    @PostMapping("/invoices/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentDto pay(@PathVariable UUID id, @Valid @RequestBody PaymentRequest req) {
        return PaymentDto.of(billing.recordPayment(id, new BillingService.PaymentCommand(
                req.method(), req.amountHalalas(), req.reference(), req.paidAt())));
    }

    @PostMapping("/invoices/{id}/void")
    @PreAuthorize("hasRole('OWNER')")
    public InvoiceDto voidInvoice(@PathVariable UUID id, @Valid @RequestBody VoidRequest req) {
        billing.voidInvoice(id, req.reason());
        return invoice(id);
    }

    @PostMapping("/invoices/{id}/send")
    public LinkDto send(@PathVariable UUID id) {
        return new LinkDto(billing.sendInvoice(id));
    }

    @PostMapping("/invoices/{id}/link")
    public LinkDto invoiceLink(@PathVariable UUID id) {
        return new LinkDto(billing.invoiceLink(id));
    }

    @GetMapping("/invoices/{id}/pdf")
    public ResponseEntity<byte[]> invoicePdf(@PathVariable UUID id) {
        Invoice inv = billing.getInvoice(id);
        return pdf(pdfs.invoicePdf(id), "INV-" + inv.getNumber());
    }

    // ------------------------------------------------------------------------------------------ quotes

    @GetMapping("/quotes")
    public PageResponse<QuoteSummary> quotes(@RequestParam(required = false) String status,
                                             @RequestParam(required = false) UUID customerId,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        LocalDate today = LocalDate.now(billing.zone());
        return PageResponse.of(billing.searchQuotes(status, customerId, pageRequest(page, size)),
                q -> QuoteSummary.of(q, today));
    }

    @GetMapping("/quotes/{id}")
    public QuoteDto quote(@PathVariable UUID id) {
        BillingService.QuoteDetail d = billing.quoteDetail(id);
        return QuoteDto.of(d.quote(), LocalDate.now(billing.zone()), d.publicUrl(), d.invoiceId());
    }

    @PostMapping("/quotes")
    @ResponseStatus(HttpStatus.CREATED)
    public QuoteDto createQuote(@Valid @RequestBody QuoteRequest req) {
        return quote(billing.createQuote(command(req)).getId());
    }

    @PostMapping("/bookings/{bookingId}/quote")
    @ResponseStatus(HttpStatus.CREATED)
    public QuoteDto quoteForBooking(@PathVariable UUID bookingId,
                                    @Valid @RequestBody(required = false) QuoteFromBookingRequest req) {
        QuoteFromBookingRequest r = req == null ? new QuoteFromBookingRequest(null, null) : req;
        return quote(billing.quoteFromBooking(bookingId, r.validUntil(), r.notes()).getId());
    }

    @PutMapping("/quotes/{id}")
    public QuoteDto updateQuote(@PathVariable UUID id, @Valid @RequestBody QuoteRequest req) {
        billing.updateQuote(id, command(req));
        return quote(id);
    }

    @PostMapping("/quotes/{id}/send")
    public LinkDto sendQuote(@PathVariable UUID id) {
        return new LinkDto(billing.sendQuote(id));
    }

    @PostMapping("/quotes/{id}/link")
    public LinkDto quoteLink(@PathVariable UUID id) {
        return new LinkDto(billing.quoteLink(id));
    }

    @PostMapping("/quotes/{id}/accept")
    public QuoteDto accept(@PathVariable UUID id) {
        billing.respondToQuote(id, true);
        return quote(id);
    }

    @PostMapping("/quotes/{id}/reject")
    public QuoteDto reject(@PathVariable UUID id) {
        billing.respondToQuote(id, false);
        return quote(id);
    }

    @PostMapping("/quotes/{id}/invoice")
    @ResponseStatus(HttpStatus.CREATED)
    public InvoiceDto convert(@PathVariable UUID id, @Valid @RequestBody(required = false) ConvertQuoteRequest req) {
        ConvertQuoteRequest r = req == null ? new ConvertQuoteRequest(null, null) : req;
        Invoice inv = billing.convertQuote(id, r.dueDate(), Boolean.TRUE.equals(r.send()));
        return invoice(inv.getId());
    }

    @GetMapping("/quotes/{id}/pdf")
    public ResponseEntity<byte[]> quotePdf(@PathVariable UUID id) {
        Quote q = billing.getQuote(id);
        return pdf(pdfs.quotePdf(id), "Q-" + q.getNumber());
    }

    // ----------------------------------------------------------------------------------------- helpers

    private static PageRequest pageRequest(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100));
    }

    static ResponseEntity<byte[]> pdf(byte[] body, String name) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(name + ".pdf").build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(body);
    }

    private static List<BillingService.LineInput> lines(List<LineRequest> lines) {
        return lines.stream().map(l -> new BillingService.LineInput(l.serviceId(), l.quantity(), l.addonIds(),
                l.description(), l.unitPriceHalalas())).toList();
    }

    private static BillingService.QuoteCommand command(QuoteRequest req) {
        return new BillingService.QuoteCommand(req.customerId(), req.bookingId(), lines(req.lines()),
                req.discountHalalas() == null ? 0 : req.discountHalalas(), req.validUntil(), req.notes());
    }

    public record LineRequest(UUID serviceId, @DecimalMin(value = "0.01") BigDecimal quantity, List<UUID> addonIds,
                              @Size(max = 300) String description, @Min(0) Long unitPriceHalalas) {
    }

    public record IssueInvoiceRequest(@NotNull UUID customerId, @NotEmpty @Size(max = 100) List<@Valid LineRequest> lines,
                                      @Min(0) Long discountHalalas, LocalDate dueDate,
                                      @Size(max = 2000) String notes, @Size(max = 20) String customerVatNumber,
                                      Boolean send) {
    }

    public record FromBookingRequest(@Min(0) Long discountHalalas, LocalDate dueDate, @Size(max = 2000) String notes,
                                     @Size(max = 20) String customerVatNumber, Boolean send) {
    }

    public record QuoteRequest(@NotNull UUID customerId, UUID bookingId,
                               @NotEmpty @Size(max = 100) List<@Valid LineRequest> lines,
                               @Min(0) Long discountHalalas, LocalDate validUntil, @Size(max = 2000) String notes) {
    }

    public record QuoteFromBookingRequest(LocalDate validUntil, @Size(max = 2000) String notes) {
    }

    public record ConvertQuoteRequest(LocalDate dueDate, Boolean send) {
    }

    public record PaymentRequest(@NotNull Payment.Method method, @Positive long amountHalalas,
                                 @Size(max = 100) String reference, Instant paidAt) {
    }

    public record VoidRequest(@NotBlank @Size(max = 500) String reason) {
    }
}
