package com.fieldops.app.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** API shapes for quotes, invoices and payments (staff and public pages). */
public final class BillingDtos {

    private BillingDtos() {
    }

    public record LineDto(String description, BigDecimal quantity, long unitPriceHalalas, long totalHalalas) {
        static List<LineDto> of(List<DocumentLine> lines) {
            return lines.stream().map(l -> new LineDto(l.getDescription(), l.getQuantity(), l.getUnitPriceHalalas(),
                    l.getTotalHalalas())).toList();
        }
    }

    public record PaymentDto(UUID id, String method, long amountHalalas, String reference, Instant paidAt) {
        static PaymentDto of(Payment p) {
            return new PaymentDto(p.getId(), p.getMethod().name(), p.getAmountHalalas(), p.getReference(), p.getPaidAt());
        }
    }

    public record InvoiceSummary(UUID id, long number, String status, UUID customerId, String customerName,
                                 Instant issuedAt, LocalDate dueDate, long totalHalalas, long paidHalalas,
                                 UUID bookingId) {
        static InvoiceSummary of(Invoice i) {
            return new InvoiceSummary(i.getId(), i.getNumber(), i.getStatus().name(), i.getCustomerId(),
                    i.getCustomerName(), i.getIssuedAt(), i.getDueDate(), i.getTotalHalalas(), i.getPaidHalalas(),
                    i.getBookingId());
        }
    }

    public record InvoiceDto(UUID id, long number, String status, boolean vatInvoice, UUID bookingId, UUID quoteId,
                             UUID customerId, String customerName, String customerPhone, String customerVatNumber,
                             String sellerName, String sellerVatNumber, String sellerAddress, String sellerCr,
                             Instant issuedAt, LocalDate dueDate, boolean pricesIncludeVat, int vatRateBp,
                             List<LineDto> lines, long linesTotalHalalas, long discountHalalas, long taxableHalalas,
                             long vatHalalas, long totalHalalas, long paidHalalas, long balanceHalalas,
                             String notes, String voidReason, Instant voidedAt, String zatcaQr, QrPath zatcaQrPath,
                             List<PaymentDto> payments, String publicUrl) {
        static InvoiceDto of(Invoice i, List<Payment> payments, String publicUrl) {
            String qr = i.zatcaQr();
            return new InvoiceDto(i.getId(), i.getNumber(), i.getStatus().name(), i.isVatInvoice(), i.getBookingId(),
                    i.getQuoteId(), i.getCustomerId(), i.getCustomerName(), i.getCustomerPhone(),
                    i.getCustomerVatNumber(), i.getSellerName(), i.getSellerVatNumber(), i.getSellerAddress(),
                    i.getSellerCr(), i.getIssuedAt(), i.getDueDate(), i.isPricesIncludeVat(), i.getVatRateBp(),
                    LineDto.of(i.getLines()), i.getLinesTotalHalalas(), i.getDiscountHalalas(), i.getTaxableHalalas(),
                    i.getVatHalalas(), i.getTotalHalalas(), i.getPaidHalalas(), i.balanceHalalas(), i.getNotes(),
                    i.getVoidReason(), i.getVoidedAt(), qr, QrPath.of(qr),
                    payments.stream().map(PaymentDto::of).toList(), publicUrl);
        }
    }

    public record QuoteSummary(UUID id, long number, String status, UUID customerId, String customerName,
                               Instant createdAt, LocalDate validUntil, long totalHalalas, boolean expired) {
        static QuoteSummary of(Quote q, LocalDate today) {
            return new QuoteSummary(q.getId(), q.getNumber(), q.getStatus().name(), q.getCustomerId(),
                    q.getCustomerName(), q.getCreatedAt(), q.getValidUntil(), q.getTotalHalalas(), q.isExpired(today));
        }
    }

    public record QuoteDto(UUID id, long number, String status, boolean expired, UUID bookingId, UUID customerId,
                           String customerName, String customerPhone, Instant createdAt, LocalDate validUntil,
                           boolean pricesIncludeVat, int vatRateBp, List<LineDto> lines, long linesTotalHalalas,
                           long discountHalalas, long taxableHalalas, long vatHalalas, long totalHalalas,
                           String notes, Instant respondedAt, String publicUrl, UUID invoiceId) {
        static QuoteDto of(Quote q, LocalDate today, String publicUrl, UUID invoiceId) {
            return new QuoteDto(q.getId(), q.getNumber(), q.getStatus().name(), q.isExpired(today), q.getBookingId(),
                    q.getCustomerId(), q.getCustomerName(), q.getCustomerPhone(), q.getCreatedAt(), q.getValidUntil(),
                    q.isPricesIncludeVat(), q.getVatRateBp(), LineDto.of(q.getLines()), q.getLinesTotalHalalas(),
                    q.getDiscountHalalas(), q.getTaxableHalalas(), q.getVatHalalas(), q.getTotalHalalas(),
                    q.getNotes(), q.getRespondedAt(), publicUrl, invoiceId);
        }
    }

    /** Company block for the public invoice/quote page. */
    public record CompanyDto(String name, String slug, String logoUrl, String phone, String vatNumber,
                             String address, String commercialRegistration, String timezone) {
    }

    public record PublicInvoiceDto(CompanyDto company, InvoiceDto invoice) {
    }

    public record PublicQuoteDto(CompanyDto company, QuoteDto quote) {
    }

    public record LinkDto(String url) {
    }
}
