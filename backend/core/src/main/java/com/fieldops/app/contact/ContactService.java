package com.fieldops.app.contact;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.inbox.InboxKind;
import com.fieldops.app.inbox.InboxService;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** "Contact us" messages: sent from the portal, handled by the office in the admin app. */
@Service
public class ContactService {

    /** Per mobile number per company, so one visitor cannot flood the inbox. */
    static final int MAX_PER_DAY = 5;

    private final ContactMessageRepository messages;
    private final InboxService inbox;
    private final Clock clock;

    public ContactService(ContactMessageRepository messages, InboxService inbox, Clock clock) {
        this.messages = messages;
        this.inbox = inbox;
        this.clock = clock;
    }

    public record NewMessage(UUID customerId, String name, String phone, String email, ContactMessage.Topic topic,
                             String message) {
    }

    /** Runs inside the company's tenant context (the portal sets it from the link). */
    @Transactional
    public ContactMessage submit(NewMessage m) {
        String phone = PhoneNumbers.normalizeSaudiMobile(m.phone() == null ? "" : m.phone())
                .orElseThrow(() -> ApiException.badRequest("invalid_phone", "Enter a Saudi mobile number (05XXXXXXXX)"));
        String name = trim(m.name(), 150);
        String text = trim(m.message(), 2000);
        if (name == null || text == null) {
            throw ApiException.badRequest("contact_incomplete", "Name and message are required");
        }
        Instant dayAgo = Instant.now(clock).minus(Duration.ofDays(1));
        if (messages.countByPhoneAndCreatedAtAfter(phone, dayAgo) >= MAX_PER_DAY) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "contact_limit",
                    "Too many messages today. Please call or message the company directly.");
        }
        ContactMessage saved = messages.save(new ContactMessage(m.customerId(), name, phone, trim(m.email(), 200),
                m.topic() == null ? ContactMessage.Topic.OTHER : m.topic(), text));
        inbox.toStaff(InboxKind.CONTACT_NEW, null, saved.getId(), null, name, null);
        return saved;
    }

    /** {@code status} null = all. Newest first. */
    @Transactional(readOnly = true)
    public List<ContactMessage> list(ContactMessage.Status status) {
        PageRequest page = PageRequest.of(0, 200);
        return status == null ? messages.findAllByOrderByCreatedAtDesc(page)
                : messages.findByStatusOrderByCreatedAtDesc(status, page);
    }

    @Transactional(readOnly = true)
    public long countNew() {
        return messages.countByStatus(ContactMessage.Status.NEW);
    }

    @Transactional
    public ContactMessage setDone(UUID id, boolean done) {
        ContactMessage m = messages.findById(id).orElseThrow(() -> ApiException.notFound("contact_message"));
        if (done) {
            m.markDone(CurrentUser.idOrNull(), Instant.now(clock));
        } else {
            m.reopen();
        }
        return m;
    }

    private static String trim(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
