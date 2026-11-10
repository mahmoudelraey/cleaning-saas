package com.fieldops.app.billing;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import com.fieldops.app.booking.Booking;
import com.fieldops.app.booking.BookingItem;
import com.fieldops.app.booking.BookingPricing;
import com.fieldops.app.booking.BookingService;
import com.fieldops.app.booking.BookingStatus;
import com.fieldops.app.booking.VisitEvent;
import com.fieldops.app.catalog.ServiceOfferingRepository;
import com.fieldops.app.common.persistence.TenantCounterService;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.customer.Customer;
import com.fieldops.app.customer.CustomerService;
import com.fieldops.app.inbox.InboxKind;
import com.fieldops.app.inbox.InboxService;
import com.fieldops.app.notification.NotificationService;
import com.fieldops.app.notification.NotificationTemplate;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Quotes, invoices and payments for the signed-in company.
 *
 * <p>Rules: invoices are issued directly (no drafts) so numbers are gap-free; issued invoices never
 * change except for payments and voiding; one live invoice per booking; prices for catalog lines come
 * from the catalog, free-text lines are typed by office staff.
 */
@Service
public class BillingService {

    public static final int MAX_LINES = 100;
    private static final Set<BookingStatus> NOT_BILLABLE = EnumSet.of(BookingStatus.CANCELLED, BookingStatus.NO_SHOW);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final InvoiceRepository invoices;
    private final QuoteRepository quotes;
    private final PaymentRepository payments;
    private final PublicLinkRepository links;
    private final TenantCounterService counters;
    private final TenantService tenants;
    private final CustomerService customers;
    private final BookingService bookings;
    private final BookingPricing pricing;
    private final NotificationService notifications;
    private final Clock clock;
    private final ServiceOfferingRepository catalog;
    private final InboxService inbox;
    private final String publicBaseUrl;

    public BillingService(InvoiceRepository invoices, QuoteRepository quotes, PaymentRepository payments,
                          PublicLinkRepository links, TenantCounterService counters, TenantService tenants,
                          CustomerService customers, BookingService bookings, BookingPricing pricing,
                          NotificationService notifications, Clock clock, ServiceOfferingRepository catalog,
                          InboxService inbox,
                          @Value("${app.public-base-url:http://localhost:4200}") String publicBaseUrl) {
        this.invoices = invoices;
        this.quotes = quotes;
        this.payments = payments;
        this.links = links;
        this.counters = counters;
        this.tenants = tenants;
        this.customers = customers;
        this.bookings = bookings;
        this.pricing = pricing;
        this.notifications = notifications;
        this.clock = clock;
        this.catalog = catalog;
        this.inbox = inbox;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
    }

    /**
     * A line as sent by the client: either a catalog service (priced server-side, add-ons allowed) or a
     * free-text line with its own unit price.
     */
    public record LineInput(UUID serviceId, BigDecimal quantity, List<UUID> addonIds, String description,
                            Long unitPriceHalalas) {
    }

    public record InvoiceCommand(UUID customerId, List<LineInput> lines, long discountHalalas, LocalDate dueDate,
                                 String notes, String customerVatNumber, boolean send) {
    }

    public record FromBookingCommand(long discountHalalas, LocalDate dueDate, String notes, String customerVatNumber,
                                     boolean send) {
    }

    public record QuoteCommand(UUID customerId, UUID bookingId, List<LineInput> lines, long discountHalalas,
                               LocalDate validUntil, String notes) {
    }

    public record PaymentCommand(Payment.Method method, long amountHalalas, String reference, Instant paidAt) {
    }

    public record InvoiceDetail(Invoice invoice, List<Payment> payments, String publicUrl) {
    }

    public record QuoteDetail(Quote quote, String publicUrl, UUID invoiceId) {
    }

    // ---------------------------------------------------------------------------------------- invoices

    @Transactional(readOnly = true)
    public Page<Invoice> searchInvoices(String status, UUID customerId, Pageable pageable) {
        if (customerId != null) {
            return invoices.findByCustomerIdOrderByIssuedAtDesc(customerId, pageable);
        }
        if ("UNPAID".equals(status)) {
            return invoices.findByStatusInOrderByIssuedAtDesc(
                    List.of(Invoice.Status.ISSUED, Invoice.Status.PARTIALLY_PAID), pageable);
        }
        if (status != null && !status.isBlank()) {
            return invoices.findByStatusInOrderByIssuedAtDesc(List.of(parse(Invoice.Status.class, status)), pageable);
        }
        return invoices.findAllByOrderByIssuedAtDesc(pageable);
    }

    @Transactional(readOnly = true)
    public Invoice getInvoice(UUID id) {
        return invoices.findWithLines(id).orElseThrow(() -> ApiException.notFound("invoice"));
    }

    @Transactional(readOnly = true)
    public InvoiceDetail invoiceDetail(UUID id) {
        Invoice inv = getInvoice(id);
        return new InvoiceDetail(inv, payments.findByInvoiceIdOrderByPaidAtAsc(id),
                existingUrl(PublicLink.Type.INVOICE, id));
    }

    @Transactional(readOnly = true)
    public List<Invoice> invoicesForBooking(UUID bookingId) {
        return invoices.findByBookingIdOrderByIssuedAtDesc(bookingId);
    }

    @Transactional
    public Invoice issueFromBooking(UUID bookingId, FromBookingCommand cmd) {
        Booking b = bookings.get(bookingId);
        if (NOT_BILLABLE.contains(b.getStatus())) {
            throw ApiException.conflict("booking_not_billable", "Cancelled or no-show bookings cannot be invoiced");
        }
        if (invoices.findLiveForBooking(bookingId, Invoice.Status.VOID).isPresent()) {
            throw ApiException.conflict("already_invoiced", "This booking already has an invoice");
        }
        List<DocumentLine> lines = new ArrayList<>();
        for (BookingItem item : b.getItems()) {
            lines.add(lineFrom(item));
        }
        // The booking's promo discount comes first; the office may add more on top (never past the lines total).
        long linesTotal = lines.stream().mapToLong(DocumentLine::getTotalHalalas).sum();
        long discount = Math.min(linesTotal, b.getDiscountHalalas() + Math.max(0, cmd.discountHalalas()));
        String notes = cmd.notes();
        if (b.getPromoCode() != null && b.getDiscountHalalas() > 0) {
            String promoNote = "Promo / كود الخصم: " + b.getPromoCode();
            notes = notes == null || notes.isBlank() ? promoNote : notes + "\n" + promoNote;
            notes = notes.length() > 2000 ? notes.substring(0, 2000) : notes;
        }
        // Snapshot from the booking (works even if the customer was deleted since).
        Invoice inv = issue(b.getCustomerId(), b.getCustomerName(), b.getCustomerPhone(), cmd.customerVatNumber(),
                lines, discount, cmd.dueDate(), notes, bookingId, null);
        b.invoiceIssued();
        bookings.log(bookingId, VisitEvent.Type.INVOICE_ISSUED, null, null, "#" + inv.getNumber());
        if (cmd.send()) {
            send(inv);
        }
        return inv;
    }

    @Transactional
    public Invoice issueStandalone(InvoiceCommand cmd) {
        Customer c = customers.get(cmd.customerId());
        Invoice inv = issue(c.getId(), c.getName(), c.getPhone(), cmd.customerVatNumber(), toLines(cmd.lines()),
                cmd.discountHalalas(), cmd.dueDate(), cmd.notes(), null, null);
        if (cmd.send()) {
            send(inv);
        }
        return inv;
    }

    @Transactional
    public Payment recordPayment(UUID invoiceId, PaymentCommand cmd) {
        Invoice inv = getInvoice(invoiceId);
        if (cmd.method() == null) {
            throw ApiException.badRequest("method_required", "Choose a payment method");
        }
        Instant paidAt = cmd.paidAt() != null ? cmd.paidAt() : Instant.now(clock);
        if (paidAt.isAfter(Instant.now(clock).plusSeconds(300))) {
            throw ApiException.badRequest("invalid_paid_at", "Payment date cannot be in the future");
        }
        inv.addPayment(cmd.amountHalalas());
        return payments.save(new Payment(inv.getId(), cmd.method(), cmd.amountHalalas(), trimToNull(cmd.reference()),
                null, paidAt));
    }

    @Transactional
    public Invoice voidInvoice(UUID invoiceId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw ApiException.badRequest("reason_required", "Enter the reason for voiding");
        }
        Invoice inv = getInvoice(invoiceId);
        inv.voidInvoice(reason.trim(), Instant.now(clock));
        if (inv.getBookingId() != null) {
            bookings.get(inv.getBookingId()).invoiceVoided(); // a corrected invoice can be issued again
        }
        return inv;
    }

    /** Sends the customer a WhatsApp/SMS message with the invoice link. */
    @Transactional
    public String sendInvoice(UUID invoiceId) {
        Invoice inv = getInvoice(invoiceId);
        if (inv.getStatus() == Invoice.Status.VOID) {
            throw ApiException.conflict("invoice_void", "A void invoice cannot be sent");
        }
        return send(inv);
    }

    @Transactional
    public String invoiceLink(UUID invoiceId) {
        Invoice inv = getInvoice(invoiceId);
        return url(PublicLink.Type.INVOICE, linkFor(PublicLink.Type.INVOICE, inv.getId()));
    }

    // ------------------------------------------------------------------------------------------ quotes

    @Transactional(readOnly = true)
    public Page<Quote> searchQuotes(String status, UUID customerId, Pageable pageable) {
        if (customerId != null) {
            return quotes.findByCustomerIdOrderByCreatedAtDesc(customerId, pageable);
        }
        if (status != null && !status.isBlank()) {
            return quotes.findByStatusOrderByCreatedAtDesc(parse(Quote.Status.class, status), pageable);
        }
        return quotes.findAllByOrderByCreatedAtDesc(pageable);
    }

    @Transactional(readOnly = true)
    public Quote getQuote(UUID id) {
        return quotes.findWithLines(id).orElseThrow(() -> ApiException.notFound("quote"));
    }

    @Transactional(readOnly = true)
    public QuoteDetail quoteDetail(UUID id) {
        Quote q = getQuote(id);
        UUID invoiceId = invoices.findByQuoteIdAndStatusNot(id, Invoice.Status.VOID).map(Invoice::getId).orElse(null);
        return new QuoteDetail(q, existingUrl(PublicLink.Type.QUOTE, id), invoiceId);
    }

    @Transactional
    public Quote createQuote(QuoteCommand cmd) {
        Quote q = new Quote(counters.next(TenantCounterService.QUOTE));
        apply(q, cmd);
        return quotes.save(q);
    }

    /** Builds a quote from a booking's priced items (e.g. a request that needs approval first). */
    @Transactional
    public Quote quoteFromBooking(UUID bookingId, LocalDate validUntil, String notes) {
        Booking b = bookings.get(bookingId);
        List<DocumentLine> lines = new ArrayList<>();
        for (BookingItem item : b.getItems()) {
            lines.add(lineFrom(item));
        }
        Tenant t = tenants.current();
        Quote q = new Quote(counters.next(TenantCounterService.QUOTE));
        q.setCustomer(b.getCustomerId(), b.getCustomerName(), b.getCustomerPhone());
        q.setDetails(bookingId, validUntilOrDefault(validUntil), trimToNull(notes));
        q.replaceLines(lines, b.getDiscountHalalas(), t.isVatRegistered(), t.isPricesIncludeVat());
        return quotes.save(q);
    }

    @Transactional
    public Quote updateQuote(UUID id, QuoteCommand cmd) {
        Quote q = getQuote(id);
        q.assertEditable();
        apply(q, cmd);
        return q;
    }

    @Transactional
    public String sendQuote(UUID id) {
        Quote q = getQuote(id);
        q.assertEditable();
        q.markSent();
        Tenant t = tenants.current();
        String link = url(PublicLink.Type.QUOTE, linkFor(PublicLink.Type.QUOTE, q.getId()));
        notifications.enqueue(q.getBookingId(), NotificationTemplate.QUOTE_SENT, q.getCustomerPhone(), List.of(
                firstName(q.getCustomerName()), t.getName(), "Q-" + q.getNumber(), money(q.getTotalHalalas()), link));
        return link;
    }

    @Transactional
    public String quoteLink(UUID id) {
        Quote q = getQuote(id);
        return url(PublicLink.Type.QUOTE, linkFor(PublicLink.Type.QUOTE, q.getId()));
    }

    /** Office records the customer's answer (phone call etc.). */
    @Transactional
    public Quote respondToQuote(UUID id, boolean accepted) {
        Quote q = getQuote(id);
        q.respond(accepted, Instant.now(clock));
        return q;
    }

    /** Invoice with the quote's exact lines and discount. Accepts the quote if it was still open. */
    @Transactional
    public Invoice convertQuote(UUID id, LocalDate dueDate, boolean send) {
        Quote q = getQuote(id);
        if (q.getStatus() == Quote.Status.REJECTED) {
            throw ApiException.conflict("quote_rejected", "A rejected quote cannot be invoiced");
        }
        if (invoices.findByQuoteIdAndStatusNot(id, Invoice.Status.VOID).isPresent()) {
            throw ApiException.conflict("already_invoiced", "This quote already has an invoice");
        }
        if (q.getStatus() != Quote.Status.ACCEPTED) {
            q.respond(true, Instant.now(clock));
        }
        UUID bookingId = q.getBookingId();
        if (bookingId != null && invoices.findLiveForBooking(bookingId, Invoice.Status.VOID).isPresent()) {
            bookingId = null; // the booking was invoiced separately; keep the quote's invoice standalone
        }
        List<DocumentLine> lines = q.getLines().stream().map(DocumentLine::copy).toList();
        Invoice inv = issue(q.getCustomerId(), q.getCustomerName(), q.getCustomerPhone(), null, new ArrayList<>(lines),
                q.getDiscountHalalas(), dueDate, q.getNotes(), bookingId, q.getId());
        if (bookingId != null) {
            bookings.get(bookingId).invoiceIssued();
        }
        if (send) {
            send(inv);
        }
        return inv;
    }

    // ------------------------------------------------------------------------------------------ public

    /** Called by the public page under the link's tenant (see {@link PublicDocumentService}). */
    @Transactional
    public Quote respondPublicly(UUID quoteId, boolean accepted) {
        Quote q = getQuote(quoteId);
        if (q.isExpired(LocalDate.now(clock.withZone(zone())))) {
            throw ApiException.conflict("quote_expired", "This quote has expired");
        }
        q.respond(accepted, Instant.now(clock));
        return q;
    }

    // ----------------------------------------------------------------------------------------- helpers

    public ZoneId zone() {
        return ZoneId.of(tenants.current().getTimezone());
    }

    private Invoice issue(UUID customerId, String customerName, String customerPhone, String customerVat,
                          List<DocumentLine> lines, long discount, LocalDate dueDate, String notes,
                          UUID bookingId, UUID quoteId) {
        if (lines.isEmpty()) {
            throw ApiException.badRequest("lines_required", "Add at least one line");
        }
        if (customerVat != null && !customerVat.isBlank() && !customerVat.trim().matches("^3\\d{13}3$")) {
            throw ApiException.badRequest("invalid_vat_number", "VAT number must be 15 digits starting and ending with 3");
        }
        Tenant t = tenants.current();
        Instant now = Instant.now(clock);
        if (dueDate != null && dueDate.isBefore(LocalDate.ofInstant(now, ZoneId.of(t.getTimezone())))) {
            throw ApiException.badRequest("invalid_due_date", "Due date cannot be in the past");
        }
        Invoice inv = new Invoice(counters.next(TenantCounterService.INVOICE), now, dueDate, trimToNull(notes));
        inv.setSources(bookingId, quoteId);
        inv.setCustomer(customerId, customerName, customerPhone, trimToNull(customerVat));
        inv.setSeller(t.getName(), t.getVatNumber(), t.getAddress(), t.getCommercialRegistration());
        inv.setLines(lines, discount, t.isPricesIncludeVat());
        Invoice saved;
        try {
            saved = invoices.saveAndFlush(inv);
        } catch (DataIntegrityViolationException e) {
            // ux_invoices_one_per_booking: a concurrent request invoiced the same booking first.
            throw ApiException.conflict("already_invoiced", "This booking already has an invoice");
        }
        inbox.toCustomer(customerId, InboxKind.INVOICE_ISSUED, bookingId, saved.getId(), saved.getNumber(), null);
        return saved;
    }

    private String send(Invoice inv) {
        Tenant t = tenants.current();
        String link = url(PublicLink.Type.INVOICE, linkFor(PublicLink.Type.INVOICE, inv.getId()));
        notifications.enqueue(inv.getBookingId(), NotificationTemplate.INVOICE_ISSUED, inv.getCustomerPhone(), List.of(
                firstName(inv.getCustomerName()), t.getName(), "INV-" + inv.getNumber(), money(inv.getTotalHalalas()), link));
        return link;
    }

    private void apply(Quote q, QuoteCommand cmd) {
        Customer c = customers.get(cmd.customerId());
        UUID bookingId = null;
        if (cmd.bookingId() != null) {
            Booking b = bookings.get(cmd.bookingId());
            if (!b.getCustomerId().equals(c.getId())) {
                throw ApiException.badRequest("customer_mismatch", "The booking belongs to another customer");
            }
            bookingId = b.getId();
        }
        Tenant t = tenants.current();
        q.setCustomer(c.getId(), c.getName(), c.getPhone());
        q.setDetails(bookingId, validUntilOrDefault(cmd.validUntil()), trimToNull(cmd.notes()));
        q.replaceLines(toLines(cmd.lines()), cmd.discountHalalas(), t.isVatRegistered(), t.isPricesIncludeVat());
    }

    private LocalDate validUntilOrDefault(LocalDate requested) {
        LocalDate today = LocalDate.now(clock.withZone(zone()));
        if (requested == null) {
            return today.plusDays(14);
        }
        if (requested.isBefore(today) || requested.isAfter(today.plusYears(1))) {
            throw ApiException.badRequest("invalid_valid_until", "Validity must be between today and one year");
        }
        return requested;
    }

    /** Catalog lines are priced from the catalog; free-text lines must carry a description and price. */
    List<DocumentLine> toLines(List<LineInput> input) {
        if (input == null || input.isEmpty()) {
            throw ApiException.badRequest("lines_required", "Add at least one line");
        }
        if (input.size() > MAX_LINES) {
            throw ApiException.badRequest("too_many_lines", "Too many lines");
        }
        List<DocumentLine> out = new ArrayList<>();
        for (LineInput l : input) {
            if (l.serviceId() != null) {
                BookingPricing.Priced priced = pricing.price(List.of(
                        new BookingPricing.Line(l.serviceId(), l.quantity(), l.addonIds())));
                for (BookingItem item : priced.items()) {
                    out.add(lineFrom(item));
                }
                continue;
            }
            String description = trimToNull(l.description());
            if (description == null || description.length() > 300) {
                throw ApiException.badRequest("invalid_line", "Each line needs a description (up to 300 characters)");
            }
            BigDecimal qty = l.quantity() == null ? BigDecimal.ONE : l.quantity();
            if (qty.signum() <= 0 || qty.compareTo(BigDecimal.valueOf(10_000)) > 0 || qty.stripTrailingZeros().scale() > 2) {
                throw ApiException.badRequest("invalid_quantity", "Quantity is out of range");
            }
            if (l.unitPriceHalalas() == null || l.unitPriceHalalas() < 0 || l.unitPriceHalalas() > 100_000_000L) {
                throw ApiException.badRequest("invalid_price", "Enter a valid unit price");
            }
            out.add(new DocumentLine(description, qty, l.unitPriceHalalas()));
        }
        return out;
    }

    /** A document line from a priced booking item, with the English text taken from the catalog. */
    private DocumentLine lineFrom(BookingItem item) {
        return new DocumentLine(item.getDescription(), item.getQuantity(), item.getUnitPriceHalalas())
                .withEnglish(englishName(item.getServiceId(), item.getAddonId()));
    }

    /**
     * "Apartment cleaning" or "Apartment cleaning — Fridge" from the services' English names; null when the
     * service (or its add-on) has no English name, so the PDF prints the Arabic only.
     */
    private String englishName(UUID serviceId, UUID addonId) {
        if (serviceId == null) {
            return null;
        }
        return catalog.findWithAddons(serviceId).map(s -> {
            String name = s.getNameEn();
            if (name == null || name.isBlank()) {
                return null;
            }
            if (addonId == null) {
                return name;
            }
            return s.getAddons().stream().filter(a -> addonId.equals(a.getId())).findFirst()
                    .map(a -> a.getNameEn() == null || a.getNameEn().isBlank() ? null : name + " — " + a.getNameEn())
                    .orElse(null);
        }).orElse(null);
    }

    /** Returns the existing token for a document or creates one (unguessable, 256 bits). */
    private String linkFor(PublicLink.Type type, UUID documentId) {
        return links.findByDocumentTypeAndDocumentId(type, documentId)
                .map(PublicLink::getToken)
                .orElseGet(() -> {
                    byte[] bytes = new byte[32];
                    RANDOM.nextBytes(bytes);
                    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
                    links.save(new PublicLink(token, TenantContext.require(), type, documentId, Instant.now(clock)));
                    return token;
                });
    }

    private String existingUrl(PublicLink.Type type, UUID documentId) {
        return links.findByDocumentTypeAndDocumentId(type, documentId)
                .filter(l -> l.getTenantId().equals(TenantContext.require()))
                .map(l -> url(type, l.getToken()))
                .orElse(null);
    }

    private String url(PublicLink.Type type, String token) {
        return publicBaseUrl + (type == PublicLink.Type.INVOICE ? "/i/" : "/q/") + token;
    }

    public static String money(long halalas) {
        DecimalFormat f = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.US));
        return f.format(BigDecimal.valueOf(halalas, 2));
    }

    static String firstName(String fullName) {
        return fullName == null || fullName.isBlank() ? "" : fullName.trim().split("\\s+")[0];
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String value) {
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("invalid_status", "Unknown status " + value);
        }
    }
}
