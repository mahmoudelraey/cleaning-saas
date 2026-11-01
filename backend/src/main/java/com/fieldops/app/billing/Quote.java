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

@Entity
@Table(name = "quotes")
public class Quote extends TenantScopedEntity {

    public enum Status {
        DRAFT, SENT, ACCEPTED, REJECTED
    }

    @Column(nullable = false, updatable = false)
    private long number;

    @Column(name = "booking_id")
    private UUID bookingId;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "customer_phone", nullable = false)
    private String customerPhone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.DRAFT;

    @Column(name = "valid_until", nullable = false)
    private LocalDate validUntil;

    @Column(name = "prices_include_vat", nullable = false)
    private boolean pricesIncludeVat;

    @Column(name = "vat_rate_bp", nullable = false)
    private int vatRateBp;

    @Column(name = "lines_total_halalas", nullable = false)
    private long linesTotalHalalas;

    @Column(name = "discount_halalas", nullable = false)
    private long discountHalalas;

    @Column(name = "taxable_halalas", nullable = false)
    private long taxableHalalas;

    @Column(name = "vat_halalas", nullable = false)
    private long vatHalalas;

    @Column(name = "total_halalas", nullable = false)
    private long totalHalalas;

    private String notes;

    @Column(name = "responded_at")
    private Instant respondedAt;

    @OneToMany(mappedBy = "quote", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position asc")
    private List<DocumentLine> lines = new ArrayList<>();

    protected Quote() {
    }

    public Quote(long number) {
        this.number = number;
    }

    public void setCustomer(UUID customerId, String name, String phone) {
        this.customerId = customerId;
        this.customerName = name;
        this.customerPhone = phone;
    }

    public void setDetails(UUID bookingId, LocalDate validUntil, String notes) {
        this.bookingId = bookingId;
        this.validUntil = validUntil;
        this.notes = notes;
    }

    public void replaceLines(List<DocumentLine> newLines, long discount, boolean vatRegistered, boolean includeVat) {
        lines.clear();
        long sum = 0;
        int pos = 0;
        for (DocumentLine l : newLines) {
            l.attachToQuote(this, pos++);
            lines.add(l);
            sum += l.getTotalHalalas();
        }
        VatCalculator.Totals t = VatCalculator.compute(sum, discount, vatRegistered, includeVat);
        this.pricesIncludeVat = includeVat;
        this.vatRateBp = t.rateBp();
        this.linesTotalHalalas = t.linesTotal();
        this.discountHalalas = t.discount();
        this.taxableHalalas = t.taxable();
        this.vatHalalas = t.vat();
        this.totalHalalas = t.total();
    }

    public void assertEditable() {
        if (status != Status.DRAFT && status != Status.SENT) {
            throw ApiException.conflict("quote_closed", "This quote was already answered by the customer");
        }
    }

    public void markSent() {
        if (status == Status.DRAFT) {
            status = Status.SENT;
        }
    }

    public void respond(boolean accepted, Instant at) {
        if (status != Status.SENT && status != Status.DRAFT) {
            throw ApiException.conflict("quote_closed", "This quote was already answered");
        }
        status = accepted ? Status.ACCEPTED : Status.REJECTED;
        respondedAt = at;
    }

    public boolean isExpired(LocalDate today) {
        return (status == Status.DRAFT || status == Status.SENT) && today.isAfter(validUntil);
    }

    public long getNumber() {
        return number;
    }

    public UUID getBookingId() {
        return bookingId;
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

    public Status getStatus() {
        return status;
    }

    public LocalDate getValidUntil() {
        return validUntil;
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

    public String getNotes() {
        return notes;
    }

    public Instant getRespondedAt() {
        return respondedAt;
    }

    public List<DocumentLine> getLines() {
        return lines;
    }
}
