package com.fieldops.app.contact;

import com.fieldops.app.common.audit.AuditNames;
import com.fieldops.app.common.audit.Audited;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The office's inbox of "Contact us" messages from the customer portal. */
@RestController
@RequestMapping("/api/v1/contact-messages")
@PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
public class ContactMessageController {

    private final ContactService contacts;
    private final AuditNames audits;

    public ContactMessageController(ContactService contacts, AuditNames audits) {
        this.audits = audits;
        this.contacts = contacts;
    }

    /** @param status NEW, DONE, or empty for all */
    @GetMapping
    public List<Audited<MessageDto>> list(@RequestParam(required = false) ContactMessage.Status status) {
        return audits.list(contacts.list(status), MessageDto::of);
    }

    /** For the sidebar badge. */
    @GetMapping("/count")
    public CountDto countNew() {
        return new CountDto(contacts.countNew());
    }

    @PutMapping("/{id}/done")
    public MessageDto setDone(@PathVariable UUID id, @RequestBody DoneRequest req) {
        return MessageDto.of(contacts.setDone(id, req.done()));
    }

    public record DoneRequest(boolean done) {
    }

    public record CountDto(long count) {
    }

    public record MessageDto(UUID id, UUID customerId, String name, String phone, String email, String topic,
                             String message, String status, Instant createdAt, Instant handledAt) {
        static MessageDto of(ContactMessage m) {
            return new MessageDto(m.getId(), m.getCustomerId(), m.getName(), m.getPhone(), m.getEmail(),
                    m.getTopic().name(), m.getMessage(), m.getStatus().name(), m.getCreatedAt(), m.getHandledAt());
        }
    }
}
