package com.fieldops.app.billing;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;
import com.fieldops.app.common.web.ApiException;

/**
 * An issued invoice. Amounts, lines and seller/customer details are frozen at issue time; the only
 * later changes are payments and voiding (with a reason). Never deleted.
 */
@Entity
@Table(name = "invoices")
public class Invoice extends TenantScopedEntity {

    public enum Status {
        ISSUED, PARTIALLY_PAID, PAID, VOID
    }

    @Column(nullable = false, updatable = false)
    private long number;

    @Column(name = "booking_id", updatable = false)
    private UUID bookingId;

    @Column(name = "quote_id", updatable = false)
    private UUID quoteId;

    @Column(name = "customer_id", nullable = false, updatable = false)
    private UUID customerId;

    @Column(name = "customer_name", nullable = false, updatable = false)
    private String customerName;

    @Column(name = "customer_phone", nullable = false, updatable = false)
    private String customerPhone;

    @Column(name = "customer_vat_number", updatable = false)
    private String customerVatNumber;

    @Column(name = "seller_name", nullable = false, updatable = false)
    private String sellerName;

    @Column(name = "seller_vat_number", updatable = false)
    private String sellerVatNumber;

    @Column(name = "seller_address", updatable = false)
    private String sellerAddress;

    @Column(name = "seller_cr", updatable = false)
    private String sellerCr;

    @Column(name = "issued_at", nullable = false, updatable = false)
    private Instant issuedAt;

    @Column(name = "due_date", updatable = false)
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.ISSUED;

    @Column(name = "prices_include_vat", nullable = false, updatable = false)
    private boolean pricesIncludeVat;

    @Column(name = "vat_rate_bp", nullable = false, updatable = false)
    private int vatRateBp;

    @Column(name = "lines_total_halalas", nullable = false, updatable = false)
    private long linesTotalHalalas;

    @Column(name = "discount_halalas", nullable = false, updatable = false)
    private long discountHalalas;

    @Column(name = "taxable_halalas", nullable = false, updatable = false)
    private long taxableHalalas;

    @Column(name = "vat_halalas", nullable = false, updatable = false)
    private long vatHalalas;

    @Column(name = "total_halalas", nullable = false, updatable = false)
    private long totalHalalas;

    @Column(name = "paid_halalas", nullable = false)
    private long paidHalalas;

    @Column(updatable = false)
    private String notes;

    @Column(name = "void_reason")
    private String voidReason;

    @Column(name = "voided_at")
    private Instant voidedAt;

    @Column(name = "zatca_uuid", nullable = false, updatable = false)
    private UUID zatcaUuid;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position asc")
    private List<DocumentLine> lines = new ArrayList<>();

    protected Invoice() {
    }

    /** All fields set once; see {@link BillingService#issue}. */
    Invoice(long number, Instant issuedAt, LocalDate dueDate, String notes) {
        this.number = number;
        this.issuedAt = issuedAt;
        this.dueDate = dueDate;
        this.notes = notes;
        this.zatcaUuid = UUID.randomUUID();
    }

    void setSources(UUID bookingId, UUID quoteId) {
        this.bookingId = bookingId;
        this.quoteId = quoteId;
    }

    void setCustomer(UUID customerId, String name, String phone, String vatNumber) {
        this.customerId = customerId;
        this.customerName = name;
        this.customerPhone = phone;
        this.customerVatNumber = vatNumber;
    }

    void setSeller(String name, String vatNumber, String address, String cr) {
        this.sellerName = name;
        this.sellerVatNumber = vatNumber;
        this.sellerAddress = address;
        this.sellerCr = cr;
    }

    void setLines(List<DocumentLine> newLines, long discount, boolean includeVat) {
        long sum = 0;
        int pos = 0;
        for (DocumentLine l : newLines) {
            l.attachToInvoice(this, pos++);
            lines.add(l);
            sum += l.getTotalHalalas();
        }
        VatCalculator.Totals t = VatCalculator.compute(sum, discount, isVatInvoice(), includeVat);
        this.pricesIncludeVat = includeVat;
        this.vatRateBp = t.rateBp();
        this.linesTotalHalalas = t.linesTotal();
        this.discountHalalas = t.discount();
        this.taxableHalalas = t.taxable();
        this.vatHalalas = t.vat();
        this.totalHalalas = t.total();
    }

    /** A tax invoice only when the seller is VAT-registered. */
    public boolean isVatInvoice() {
        return sellerVatNumber != null && !sellerVatNumber.isBlank();
    }

    public void addPayment(long amount) {
        if (status == Status.VOID) {
            throw ApiException.conflict("invoice_void", "Cannot record a payment on a void invoice");
        }
        if (amount <= 0 || paidHalalas + amount > totalHalalas) {
            throw ApiException.badRequest("invalid_amount", "Payment exceeds the remaining balance");
        }
        paidHalalas += amount;
        status = paidHalalas >= totalHalalas ? Status.PAID : Status.PARTIALLY_PAID;
    }

    public void voidInvoice(String reason, Instant at) {
        if (status == Status.VOID) {
            return;
        }
        if (paidHalalas > 0) {
            throw ApiException.conflict("invoice_has_payments", "Refund the payments before voiding this invoice");
        }
        status = Status.VOID;
        voidReason = reason;
        voidedAt = at;
    }

    public String zatcaQr() {
        return isVatInvoice() ? ZatcaQr.encode(sellerName, sellerVatNumber, issuedAt, totalHalalas, vatHalalas) : null;
    }

    public long balanceHalalas() {
        return status == Status.VOID ? 0 : totalHalalas - paidHalalas;
    }

    public long getNumber() {
        return number;
    }

    public UUID getBookingId() {
        return bookingId;
    }

    public UUID getQuoteId() {
        return quoteId;
    }

    public UUID getCustomerId() {
        return customerId;
    }

    public String getCustomerName() {
        return customerName;
    }

    public String getCustomerPhone() {
        return customerPhone;
    }

    public String getCustomerVatNumber() {
        return customerVatNumber;
    }

    public String getSellerName() {
        return sellerName;
    }

    public String getSellerVatNumber() {
        return sellerVatNumber;
    }

    public String getSellerAddress() {
        return sellerAddress;
    }

    public String getSellerCr() {
        return sellerCr;
    }

    public Instant getIssuedAt() {
        return issuedAt;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public Status getStatus() {
        return status;
    }

    public boolean isPricesIncludeVat() {
        return pricesIncludeVat;
    }

    public int getVatRateBp() {
        return vatRateBp;
    }

    public long getLinesTotalHalalas() {
        return linesTotalHalalas;
    }

    public long getDiscountHalalas() {
        return discountHalalas;
    }

    public long getTaxableHalalas() {
        return taxableHalalas;
    }

    public long getVatHalalas() {
        return vatHalalas;
    }

    public long getTotalHalalas() {
        return totalHalalas;
    }

    public long getPaidHalalas() {
        return paidHalalas;
    }

    public String getNotes() {
        return notes;
    }

    public String getVoidReason() {
        return voidReason;
    }

    public Instant getVoidedAt() {
        return voidedAt;
    }

    public UUID getZatcaUuid() {
        return zatcaUuid;
    }

    public List<DocumentLine> getLines() {
        return lines;
    }
}
