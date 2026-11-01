package com.fieldops.app.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** A line on a quote or an invoice (exactly one of the two). */
@Entity
@Table(name = "document_lines")
public class DocumentLine extends TenantScopedEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "quote_id", updatable = false)
    private Quote quote;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id", updatable = false)
    private Invoice invoice;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false)
    private String description;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal quantity;

    @Column(name = "unit_price_halalas", nullable = false)
    private long unitPriceHalalas;

    @Column(name = "total_halalas", nullable = false)
    private long totalHalalas;

    protected DocumentLine() {
    }

    public DocumentLine(String description, BigDecimal quantity, long unitPriceHalalas) {
        this.description = description;
        this.quantity = quantity.setScale(2, RoundingMode.HALF_UP);
        this.unitPriceHalalas = unitPriceHalalas;
        this.totalHalalas = this.quantity.multiply(BigDecimal.valueOf(unitPriceHalalas))
                .setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    /** Copy for another document (quote → invoice). */
    public DocumentLine copy() {
        DocumentLine c = new DocumentLine();
        c.description = description;
        c.quantity = quantity;
        c.unitPriceHalalas = unitPriceHalalas;
        c.totalHalalas = totalHalalas;
        return c;
    }

    void attachToQuote(Quote q, int position) {
        this.quote = q;
        this.position = position;
    }

    void attachToInvoice(Invoice i, int position) {
        this.invoice = i;
        this.position = position;
    }

    public int getPosition() {
        return position;
    }

    public String getDescription() {
        return description;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public long getUnitPriceHalalas() {
        return unitPriceHalalas;
    }

    public long getTotalHalalas() {
        return totalHalalas;
    }
}
