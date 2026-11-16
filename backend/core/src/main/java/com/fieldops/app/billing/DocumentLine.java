package com.fieldops.app.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

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

    /** English text printed under {@code description} (null when the service has no English name). */
    @Column(name = "description_en")
    private String descriptionEn;

    /** The catalog service (and add-on) this line was priced from; null for a free-text line. */
    @Column(name = "service_id")
    private UUID serviceId;

    @Column(name = "addon_id")
    private UUID addonId;

    /** The service's option (e.g. large car) the line was priced with; null otherwise. */
    @Column(name = "option_id")
    private UUID optionId;

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
        c.descriptionEn = descriptionEn;
        c.serviceId = serviceId;
        c.addonId = addonId;
        c.optionId = optionId;
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

    public String getDescriptionEn() {
        return descriptionEn;
    }

    /** Sets the English text (cut to the column size); null or blank clears it. */
    public DocumentLine withEnglish(String en) {
        String v = en == null || en.isBlank() ? null : en.trim();
        this.descriptionEn = v != null && v.length() > 300 ? v.substring(0, 300) : v;
        return this;
    }

    /** Remembers the catalog service / add-on the line was priced from (an add-on needs its service). */
    public DocumentLine withCatalog(UUID serviceId, UUID addonId) {
        return withCatalog(serviceId, null, addonId);
    }

    /** The same with the service's option (option and add-on need their service; an add-on line has no option). */
    public DocumentLine withCatalog(UUID serviceId, UUID optionId, UUID addonId) {
        this.serviceId = serviceId;
        this.addonId = serviceId == null ? null : addonId;
        this.optionId = serviceId == null || this.addonId != null ? null : optionId;
        return this;
    }

    public UUID getOptionId() {
        return optionId;
    }

    public UUID getServiceId() {
        return serviceId;
    }

    public UUID getAddonId() {
        return addonId;
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
