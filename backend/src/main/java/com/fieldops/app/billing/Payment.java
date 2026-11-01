package com.fieldops.app.billing;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

@Entity
@Table(name = "payments")
public class Payment extends TenantScopedEntity {

    public enum Method {
        CASH, BANK_TRANSFER, MADA, CARD, APPLE_PAY, ONLINE, OTHER
    }

    @Column(name = "invoice_id", nullable = false, updatable = false)
    private UUID invoiceId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Method method;

    @Column(name = "amount_halalas", nullable = false, updatable = false)
    private long amountHalalas;

    @Column(updatable = false)
    private String reference;

    @Column(name = "gateway_ref", updatable = false)
    private String gatewayRef;

    @Column(name = "paid_at", nullable = false, updatable = false)
    private Instant paidAt;

    protected Payment() {
    }

    public Payment(UUID invoiceId, Method method, long amountHalalas, String reference, String gatewayRef, Instant paidAt) {
        this.invoiceId = invoiceId;
        this.method = method;
        this.amountHalalas = amountHalalas;
        this.reference = reference;
        this.gatewayRef = gatewayRef;
        this.paidAt = paidAt;
    }

    public UUID getInvoiceId() {
        return invoiceId;
    }

    public Method getMethod() {
        return method;
    }

    public long getAmountHalalas() {
        return amountHalalas;
    }

    public String getReference() {
        return reference;
    }

    public String getGatewayRef() {
        return gatewayRef;
    }

    public Instant getPaidAt() {
        return paidAt;
    }
}
