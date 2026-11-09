package com.fieldops.app.finance;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** Money paid to an employee against one salary record (a salary can be paid in several parts). */
@Entity
@Table(name = "salary_payments")
public class SalaryPayment extends TenantScopedEntity {

    public enum Method {
        CASH, BANK_TRANSFER, OTHER
    }

    @Column(name = "salary_record_id", nullable = false, updatable = false)
    private UUID salaryRecordId;

    @Column(name = "amount_halalas", nullable = false, updatable = false)
    private long amountHalalas;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Method method;

    @Column(updatable = false)
    private String reference;

    @Column(name = "paid_at", nullable = false, updatable = false)
    private Instant paidAt;

    protected SalaryPayment() {
    }

    public SalaryPayment(UUID salaryRecordId, long amountHalalas, Method method, String reference, Instant paidAt) {
        this.salaryRecordId = salaryRecordId;
        this.amountHalalas = amountHalalas;
        this.method = method;
        this.reference = reference;
        this.paidAt = paidAt;
    }

    public UUID getSalaryRecordId() {
        return salaryRecordId;
    }

    public long getAmountHalalas() {
        return amountHalalas;
    }

    public Method getMethod() {
        return method;
    }

    public String getReference() {
        return reference;
    }

    public Instant getPaidAt() {
        return paidAt;
    }
}
