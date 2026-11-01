package com.fieldops.app.billing;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.function.Supplier;

import com.fieldops.app.billing.BillingDtos.CompanyDto;
import com.fieldops.app.billing.BillingDtos.InvoiceDto;
import com.fieldops.app.billing.BillingDtos.PublicInvoiceDto;
import com.fieldops.app.billing.BillingDtos.PublicQuoteDto;
import com.fieldops.app.billing.BillingDtos.QuoteDto;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantService;
import org.springframework.stereotype.Service;

/**
 * Invoice/quote pages for end customers, reached by an unguessable token (no login). The token is
 * resolved in the global {@code public_links} table, then everything else runs as that tenant, so
 * RLS still guards the documents themselves. Unknown tokens and type mismatches look identical (404).
 *
 * <p>Deliberately not {@code @Transactional}: each tenant-scoped call opens its own transaction
 * after {@link TenantContext#runAs} has set the tenant.
 */
@Service
public class PublicDocumentService {

    private final PublicLinkRepository links;
    private final BillingService billing;
    private final BillingPdfService pdfs;
    private final TenantService tenants;
    private final Clock clock;

    public PublicDocumentService(PublicLinkRepository links, BillingService billing, BillingPdfService pdfs,
                                 TenantService tenants, Clock clock) {
        this.links = links;
        this.billing = billing;
        this.pdfs = pdfs;
        this.tenants = tenants;
        this.clock = clock;
    }

    public PublicInvoiceDto invoice(String token) {
        return as(token, PublicLink.Type.INVOICE, link -> {
            Invoice inv = billing.getInvoice(link.getDocumentId());
            // Payment references are internal; the customer sees paid/balance totals only.
            return new PublicInvoiceDto(company(), InvoiceDto.of(inv, List.of(), null));
        });
    }

    public byte[] invoicePdf(String token) {
        return as(token, PublicLink.Type.INVOICE, link -> pdfs.invoicePdf(link.getDocumentId()));
    }

    public PublicQuoteDto quote(String token) {
        return as(token, PublicLink.Type.QUOTE, link -> quoteDto(billing.getQuote(link.getDocumentId())));
    }

    public byte[] quotePdf(String token) {
        return as(token, PublicLink.Type.QUOTE, link -> pdfs.quotePdf(link.getDocumentId()));
    }

    public PublicQuoteDto respond(String token, boolean accepted) {
        return as(token, PublicLink.Type.QUOTE, link -> quoteDto(billing.respondPublicly(link.getDocumentId(), accepted)));
    }

    /** Number shown in the browser tab / file name. */
    public String invoiceNumber(String token) {
        return as(token, PublicLink.Type.INVOICE, link -> "INV-" + billing.getInvoice(link.getDocumentId()).getNumber());
    }

    public String quoteNumber(String token) {
        return as(token, PublicLink.Type.QUOTE, link -> "Q-" + billing.getQuote(link.getDocumentId()).getNumber());
    }

    private PublicQuoteDto quoteDto(Quote q) {
        CompanyDto c = company();
        LocalDate today = LocalDate.now(clock.withZone(ZoneId.of(c.timezone())));
        return new PublicQuoteDto(c, QuoteDto.of(q, today, null, null));
    }

    private CompanyDto company() {
        Tenant t = tenants.current();
        return new CompanyDto(t.getName(), t.getSlug(), t.getLogoUrl(), t.getPhone(), t.getVatNumber(), t.getAddress(),
                t.getCommercialRegistration(), t.getTimezone());
    }

    private <T> T as(String token, PublicLink.Type type, java.util.function.Function<PublicLink, T> work) {
        if (token == null || token.length() < 20 || token.length() > 64 || !token.matches("^[A-Za-z0-9_-]+$")) {
            throw ApiException.notFound("document");
        }
        PublicLink link = links.findById(token)
                .filter(l -> l.getDocumentType() == type)
                .orElseThrow(() -> ApiException.notFound("document"));
        Supplier<T> call = () -> work.apply(link);
        return TenantContext.runAs(link.getTenantId(), call);
    }
}
