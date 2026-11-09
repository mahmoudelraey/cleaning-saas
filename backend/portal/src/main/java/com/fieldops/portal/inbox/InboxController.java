package com.fieldops.portal.inbox;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.inbox.InboxNotification;
import com.fieldops.app.inbox.InboxService;
import com.fieldops.portal.security.CurrentCustomer;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in customer's notifications from this company (the portal bell). */
@RestController
@RequestMapping("/api/portal/{slug}/inbox")
public class InboxController {

    private final InboxService inbox;

    public InboxController(InboxService inbox) {
        this.inbox = inbox;
    }

    @GetMapping
    public InboxDto list(@PathVariable String slug) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        InboxService.Inbox i = TenantContext.runAs(me.tenantId(), () -> inbox.forCustomer(me.customerId()));
        return new InboxDto(i.unread(), i.items().stream().map(ItemDto::of).toList());
    }

    @GetMapping("/unread-count")
    public CountDto unread(@PathVariable String slug) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return new CountDto(TenantContext.runAs(me.tenantId(), () -> inbox.unreadForCustomer(me.customerId())));
    }

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void read(@PathVariable String slug, @PathVariable UUID id) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        TenantContext.runAs(me.tenantId(), () -> {
            inbox.markReadForCustomer(me.customerId(), id);
            return null;
        });
    }

    @PostMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void readAll(@PathVariable String slug) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        TenantContext.runAs(me.tenantId(), () -> {
            inbox.markAllReadForCustomer(me.customerId());
            return null;
        });
    }

    public record CountDto(long count) {
    }

    public record InboxDto(long unread, List<ItemDto> items) {
    }

    /** {@code actor}: for TECHNICIAN_ASSIGNED, the technicians' first names. */
    public record ItemDto(UUID id, String kind, UUID bookingId, UUID refId, Long number, String actor, Instant createdAt,
                          boolean read) {
        static ItemDto of(InboxNotification n) {
            return new ItemDto(n.getId(), n.getKind().name(), n.getBookingId(), n.getRefId(), n.getNumber(), n.getActor(),
                    n.getCreatedAt(), n.getReadAt() != null);
        }
    }
}
