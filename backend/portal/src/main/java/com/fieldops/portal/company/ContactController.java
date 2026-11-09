package com.fieldops.portal.company;

import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fieldops.app.contact.ContactMessage;
import com.fieldops.app.contact.ContactService;
import com.fieldops.app.customerportal.CustomerPortalService;
import com.fieldops.portal.security.CurrentCustomer;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** "Contact us" from the portal. Open to visitors; a signed-in customer's message is linked to them. */
@RestController
@RequestMapping("/api/portal/{slug}/contact")
public class ContactController {

    private final CustomerPortalService portal;

    public ContactController(CustomerPortalService portal) {
        this.portal = portal;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SentDto send(@PathVariable String slug, @Valid @RequestBody ContactRequest req) {
        if (req.website() != null && !req.website().isBlank()) {
            // Honeypot: a hidden field people never fill. Pretend it worked so bots learn nothing.
            return new SentDto(null);
        }
        CurrentCustomer me = CurrentCustomer.optional(slug);
        ContactMessage m = portal.contact(slug, new ContactService.NewMessage(me == null ? null : me.customerId(),
                req.name(), req.phone(), req.email(), req.topic(), req.message()));
        return new SentDto(m.getId());
    }

    public record ContactRequest(@NotBlank @Size(max = 150) String name, @NotBlank @Size(max = 20) String phone,
                                 @Size(max = 200) String email, ContactMessage.Topic topic,
                                 @NotBlank @Size(max = 2000) String message, @Size(max = 200) String website) {
    }

    public record SentDto(UUID id) {
    }
}
