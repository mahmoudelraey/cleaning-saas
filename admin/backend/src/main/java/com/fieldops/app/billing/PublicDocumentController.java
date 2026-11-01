package com.fieldops.app.billing;

import com.fieldops.app.billing.BillingDtos.PublicInvoiceDto;
import com.fieldops.app.billing.BillingDtos.PublicQuoteDto;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** No login: the share token is the credential. Rate-limited with the rest of /api/v1/public/**. */
@RestController
@RequestMapping("/api/v1/public")
public class PublicDocumentController {

    private final PublicDocumentService documents;

    public PublicDocumentController(PublicDocumentService documents) {
        this.documents = documents;
    }

    @GetMapping("/invoices/{token}")
    public PublicInvoiceDto invoice(@PathVariable String token) {
        return documents.invoice(token);
    }

    @GetMapping("/invoices/{token}/pdf")
    public ResponseEntity<byte[]> invoicePdf(@PathVariable String token) {
        return BillingController.pdf(documents.invoicePdf(token), documents.invoiceNumber(token));
    }

    @GetMapping("/quotes/{token}")
    public PublicQuoteDto quote(@PathVariable String token) {
        return documents.quote(token);
    }

    @GetMapping("/quotes/{token}/pdf")
    public ResponseEntity<byte[]> quotePdf(@PathVariable String token) {
        return BillingController.pdf(documents.quotePdf(token), documents.quoteNumber(token));
    }

    @PostMapping("/quotes/{token}/accept")
    public PublicQuoteDto accept(@PathVariable String token) {
        return documents.respond(token, true);
    }

    @PostMapping("/quotes/{token}/reject")
    public PublicQuoteDto reject(@PathVariable String token) {
        return documents.respond(token, false);
    }
}
