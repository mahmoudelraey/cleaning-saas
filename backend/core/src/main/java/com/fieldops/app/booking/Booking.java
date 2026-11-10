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
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import com.fieldops.app.common.persistence.TenantScopedEntity;
import com.fieldops.app.common.web.ApiException;
import org.hibernate.annotations.BatchSize;
import org.springframework.http.HttpStatus;

/**
 * A requested visit. The customer and address are read through {@code customer_id} / {@code address_id}
 * (customers and addresses are archived, never deleted, so old bookings always resolve). Prices are kept on
 * the items. The invoice takes its own copy of the customer when it is issued.
 */
@Entity
@Table(name = "bookings")
public class Booking extends TenantScopedEntity {

    @Column(nullable = false, updatable = false)
    private long number;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    /** Read-only; {@link #customerId} is the column that is written. */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "customer_id", insertable = false, updatable = false)
    private CustomerRef customer;

    @Column(name = "address_id")
    private UUID addressId;

    /** Read-only; {@link #addressId} is the column that is written. */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "address_id", insertable = false, updatable = false)
    private AddressRef address;

    /*
     * Set when the customer / address is chosen in this session: the linked rows above are only (re)loaded with
     * the booking, so until then the getters answer from these.
     */
    @Transient
    private Pending pendingCustomer;

    @Transient
    private Pending pendingAddress;

    private record Pending(String a, String b, BigDecimal lat, BigDecimal lng, String mapUrl) {
    }

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

    /** The promo the customer booked with (null once that promo is deleted; the code and discount stay). */
    @Column(name = "promo_id")
    private UUID promoId;

    @Column(name = "promo_code")
    private String promoCode;

    /** Taken off the subtotal by the promo; the invoice starts from this discount. */
    @Column(name = "discount_halalas", nullable = false)
    private long discountHalalas;

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

    /** Links the customer; name and phone are given only so this booking can show them before it is reloaded. */
    public void setCustomer(UUID customerId, String name, String phone) {
        this.customerId = customerId;
        this.pendingCustomer = new Pending(name, phone, null, null, null);
    }

    /** Links the address (null = none); the other values are only shown until the booking is reloaded. */
    public void setAddress(UUID addressId, String text, BigDecimal lat, BigDecimal lng, String mapUrl) {
        this.addressId = addressId;
        this.pendingAddress = new Pending(text, null, lat, lng, mapUrl);
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

    /** Records the promo code used for this booking and what it takes off (at most the subtotal). */
    public void applyPromo(UUID promoId, String code, long discount) {
        this.promoId = promoId;
        this.promoCode = code;
        this.discountHalalas = Math.max(0, Math.min(discount, subtotalHalalas));
    }

    /** After the services changed: the promo's discount on the new subtotal (or the old one, capped). */
    public void rediscount(Long discount) {
        if (promoCode == null && discountHalalas == 0) {
            return;
        }
        long d = discount != null ? discount : discountHalalas;
        this.discountHalalas = Math.max(0, Math.min(d, subtotalHalalas));
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
        BigDecimal lat = getAddressLat();
        BigDecimal lng = getAddressLng();
        if (lat != null && lng != null) {
            return "https://www.google.com/maps/search/?api=1&query=" + lat.toPlainString() + "," + lng.toPlainString();
        }
        return getAddressMapUrl();
    }

    public long getNumber() {
        return number;
    }

    public UUID getCustomerId() {
        return customerId;
    }

    public String getCustomerName() {
        if (pendingCustomer != null) {
            return pendingCustomer.a();
        }
        return customer == null ? null : customer.getName();
    }

    public String getCustomerPhone() {
        if (pendingCustomer != null) {
            return pendingCustomer.b();
        }
        return customer == null ? null : customer.getPhone();
    }

    public UUID getAddressId() {
        return addressId;
    }

    public String getAddressText() {
        if (pendingAddress != null) {
            return pendingAddress.a();
        }
        return address == null ? null : address.text();
    }

    public BigDecimal getAddressLat() {
        if (pendingAddress != null) {
            return pendingAddress.lat();
        }
        return address == null ? null : address.getLat();
    }

    public BigDecimal getAddressLng() {
        if (pendingAddress != null) {
            return pendingAddress.lng();
        }
        return address == null ? null : address.getLng();
    }

    public String getAddressMapUrl() {
        if (pendingAddress != null) {
            return pendingAddress.mapUrl();
        }
        return address == null ? null : address.getMapUrl();
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

    public UUID getPromoId() {
        return promoId;
    }

    public String getPromoCode() {
        return promoCode;
    }

    public long getDiscountHalalas() {
        return discountHalalas;
    }

    /** What the customer pays for the services before VAT: subtotal − promo discount. */
    public long getTotalAfterDiscountHalalas() {
        return subtotalHalalas - discountHalalas;
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
