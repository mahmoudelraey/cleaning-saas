package com.fieldops.portal.quote;

import java.util.UUID;

import com.fieldops.app.billing.BillingDtos;
import com.fieldops.app.customerportal.CustomerPortalService;
import com.fieldops.portal.security.CurrentCustomer;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Quotes the company sent to the signed-in customer: view, accept or decline, inside the portal. */
@RestController
@RequestMapping("/api/portal/{slug}/quotes")
public class QuoteController {

    private final CustomerPortalService portal;

    public QuoteController(CustomerPortalService portal) {
        this.portal = portal;
    }

    @GetMapping("/{id}")
    public BillingDtos.QuoteDto get(@PathVariable String slug, @PathVariable UUID id) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return portal.quote(slug, me.customerId(), id);
    }

    @PostMapping("/{id}/accept")
    public BillingDtos.QuoteDto accept(@PathVariable String slug, @PathVariable UUID id) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return portal.respondToQuote(slug, me.customerId(), id, true);
    }

    @PostMapping("/{id}/reject")
    public BillingDtos.QuoteDto reject(@PathVariable String slug, @PathVariable UUID id) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return portal.respondToQuote(slug, me.customerId(), id, false);
    }
}
