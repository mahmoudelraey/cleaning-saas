package com.fieldops.app.booking;

import java.math.BigDecimal;
import java.time.Instant;
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
import org.hibernate.annotations.BatchSize;
import org.springframework.http.HttpStatus;

/**
 * A requested visit. Customer and address are stored as snapshots so history (and later invoices)
 * stays correct when the customer record is edited or deleted.
 */
@Entity
@Table(name = "bookings")
public class Booking extends TenantScopedEntity {

    @Column(nullable = false, updatable = false)
    private long number;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "customer_name", nullable = false)
    private String customerName;

    @Column(name = "customer_phone", nullable = false)
    private String customerPhone;

    @Column(name = "address_id")
    private UUID addressId;

    @Column(name = "address_text")
    private String addressText;

    @Column(name = "address_lat", precision = 9, scale = 6)
    private BigDecimal addressLat;

    @Column(name = "address_lng", precision = 9, scale = 6)
    private BigDecimal addressLng;

    @Column(name = "address_map_url")
    private String addressMapUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BookingStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private BookingSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method")
    private PaymentMethod paymentMethod;

    @Column(name = "scheduled_start", nullable = false)
    private Instant scheduledStart;

    @Column(name = "scheduled_end", nullable = false)
    private Instant scheduledEnd;

    @Column(name = "subtotal_halalas", nullable = false)
    private long subtotalHalalas;

    private String notes;

    @Column(name = "internal_notes")
    private String internalNotes;

    @Column(name = "cancel_reason")
    private String cancelReason;

    @Column(name = "completed_at")
    private Instant completedAt;

    /** Automatic invoice progress (see AutoInvoiceService). */
    public enum InvoiceState {
        NONE, PENDING, ISSUED, FAILED
    }

    @Enumerated(EnumType.STRING)
    @Column(name = "invoice_state", nullable = false)
    private InvoiceState invoiceState = InvoiceState.NONE;

    @Column(name = "invoice_attempts", nullable = false)
    private int invoiceAttempts;

    @Column(name = "invoice_next_at")
    private Instant invoiceNextAt;

    @Column(name = "invoice_error")
    private String invoiceError;

    @OneToMany(mappedBy = "booking", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position asc")
    @BatchSize(size = 100) // list pages load all their items in one query, not one per booking
    private List<BookingItem> items = new ArrayList<>();

    protected Booking() {
    }

    public Booking(long number, BookingSource source, BookingStatus initialStatus) {
        this.number = number;
        this.source = source;
        this.status = initialStatus;
    }

    public void setCustomer(UUID customerId, String name, String phone) {
        this.customerId = customerId;
        this.customerName = name;
        this.customerPhone = phone;
    }

    public void setAddress(UUID addressId, String text, BigDecimal lat, BigDecimal lng, String mapUrl) {
        this.addressId = addressId;
        this.addressText = text;
        this.addressLat = lat;
        this.addressLng = lng;
        this.addressMapUrl = mapUrl;
    }

    public void schedule(Instant start, Instant end) {
        if (!end.isAfter(start)) {
            throw ApiException.badRequest("invalid_schedule", "End must be after start");
        }
        this.scheduledStart = start;
        this.scheduledEnd = end;
    }

    public void setPaymentMethod(PaymentMethod paymentMethod) {
        this.paymentMethod = paymentMethod;
    }

    public PaymentMethod getPaymentMethod() {
        return paymentMethod;
    }

    public void setNotes(String notes, String internalNotes) {
        this.notes = notes;
        this.internalNotes = internalNotes;
    }

    /** Queue the automatic invoice (same transaction as the completion, so it cannot be lost). */
    public void requestInvoice(Instant now) {
        if (invoiceState == InvoiceState.NONE || invoiceState == InvoiceState.FAILED) {
            invoiceState = InvoiceState.PENDING;
            invoiceAttempts = 0;
            invoiceNextAt = now;
            invoiceError = null;
        }
    }

    /** An invoice exists for this booking (issued automatically or by the office). */
    public void invoiceIssued() {
        invoiceState = InvoiceState.ISSUED;
        invoiceNextAt = null;
        invoiceError = null;
    }

    /** The office voided the invoice: allow a new one. */
    public void invoiceVoided() {
        if (invoiceState == InvoiceState.ISSUED) {
            invoiceState = InvoiceState.NONE;
        }
    }

    /** Automatic attempt failed: retry with backoff, give up after {@code maxAttempts}. */
    public void invoiceFailed(String error, Instant now, int maxAttempts) {
        invoiceAttempts++;
        invoiceError = error == null ? null : error.substring(0, Math.min(error.length(), 300));
        if (invoiceAttempts >= maxAttempts) {
            invoiceState = InvoiceState.FAILED;
            invoiceNextAt = null;
        } else {
            invoiceNextAt = now.plusSeconds(60L * (1L << Math.min(invoiceAttempts, 6)));
        }
    }

    public InvoiceState getInvoiceState() {
        return invoiceState;
    }

    public String getInvoiceError() {
        return invoiceError;
    }

    /** Replaces all lines and recomputes the subtotal. */
    public void replaceItems(List<BookingItem> newItems) {
        items.clear();
        long subtotal = 0;
        int position = 0;
        for (BookingItem item : newItems) {
            item.attachTo(this, position++);
            items.add(item);
            subtotal += item.getTotalHalalas();
        }
        this.subtotalHalalas = subtotal;
    }

    /** The single place where status changes; enforces the state machine. */
    public BookingStatus transitionTo(BookingStatus target, Instant now) {
        if (!status.canMoveTo(target)) {
            throw new ApiException(HttpStatus.CONFLICT, "invalid_transition",
                    "Cannot move booking from " + status + " to " + target);
        }
        BookingStatus previous = status;
        status = target;
        if (target == BookingStatus.COMPLETED) {
            completedAt = now;
        }
        return previous;
    }

    public void setCancelReason(String reason) {
        this.cancelReason = reason;
    }

    public void assertEditable() {
        if (!status.isEditable()) {
            throw new ApiException(HttpStatus.CONFLICT, "booking_not_editable",
                    "A booking can only be changed before the visit starts");
        }
    }

    public String navigationUrl() {
        if (addressLat != null && addressLng != null) {
            return "https://www.google.com/maps/search/?api=1&query=" + addressLat.toPlainString() + ","
                    + addressLng.toPlainString();
        }
        return addressMapUrl;
    }

    public long getNumber() {
        return number;
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

    public UUID getAddressId() {
        return addressId;
    }

    public String getAddressText() {
        return addressText;
    }

    public BigDecimal getAddressLat() {
        return addressLat;
    }

    public BigDecimal getAddressLng() {
        return addressLng;
    }

    public String getAddressMapUrl() {
        return addressMapUrl;
    }

    public BookingStatus getStatus() {
        return status;
    }

    public BookingSource getSource() {
        return source;
    }

    public Instant getScheduledStart() {
        return scheduledStart;
    }

    public Instant getScheduledEnd() {
        return scheduledEnd;
    }

    public long getSubtotalHalalas() {
        return subtotalHalalas;
    }

    public String getNotes() {
        return notes;
    }

    public String getInternalNotes() {
        return internalNotes;
    }

    public String getCancelReason() {
        return cancelReason;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public List<BookingItem> getItems() {
        return items;
    }
}
