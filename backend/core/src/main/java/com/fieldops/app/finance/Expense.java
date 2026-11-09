package com.fieldops.app.finance;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/**
 * An operating expense other than salaries (rent, fuel, supplies...). {@code amount} is what was paid, VAT
 * included; the cost that counts against profit is {@code amount - vat} (input VAT is recoverable).
 */
@Entity
@Table(name = "expenses")
public class Expense extends TenantScopedEntity {

    public enum Category {
        RENT, FUEL, TRANSPORT, SUPPLIES, EQUIPMENT, MAINTENANCE, MARKETING, UTILITIES, SOFTWARE, GOVERNMENT_FEES,
        INSURANCE, OTHER
    }

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Category category;

    @Column(name = "amount_halalas", nullable = false)
    private long amountHalalas;

    @Column(name = "vat_halalas", nullable = false)
    private long vatHalalas;

    @Column(name = "spent_on", nullable = false)
    private LocalDate spentOn;

    @Column(nullable = false)
    private String description;

    private String vendor;

    private String reference;

    /** Direct cost of one service (counts toward that service's profitability); null = general overhead. */
    @Column(name = "service_id")
    private UUID serviceId;

    protected Expense() {
    }

    public Expense(Category category, long amountHalalas, long vatHalalas, LocalDate spentOn, String description,
                   String vendor, String reference, UUID serviceId) {
        update(category, amountHalalas, vatHalalas, spentOn, description, vendor, reference, serviceId);
    }

    public final void update(Category category, long amountHalalas, long vatHalalas, LocalDate spentOn,
                             String description, String vendor, String reference, UUID serviceId) {
        this.category = category;
        this.amountHalalas = amountHalalas;
        this.vatHalalas = vatHalalas;
        this.spentOn = spentOn;
        this.description = description;
        this.vendor = vendor;
        this.reference = reference;
        this.serviceId = serviceId;
    }

    public Category getCategory() {
        return category;
    }

    public long getAmountHalalas() {
        return amountHalalas;
    }

    public long getVatHalalas() {
        return vatHalalas;
    }

    public long getCostHalalas() {
        return amountHalalas - vatHalalas;
    }

    public LocalDate getSpentOn() {
        return spentOn;
    }

    public String getDescription() {
        return description;
    }

    public String getVendor() {
        return vendor;
    }

    public String getReference() {
        return reference;
    }

    public UUID getServiceId() {
        return serviceId;
    }
}
