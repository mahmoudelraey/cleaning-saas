package com.fieldops.app.inbox;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.common.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in staff member's own in-app notifications (the bell). */
@RestController
@RequestMapping("/api/v1/inbox")
@PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
public class InboxController {

    private final InboxService inbox;

    public InboxController(InboxService inbox) {
        this.inbox = inbox;
    }

    @GetMapping
    public InboxDto list() {
        InboxService.Inbox i = inbox.forUser(CurrentUser.id());
        return new InboxDto(i.unread(), i.items().stream().map(ItemDto::of).toList());
    }

    /** Cheap poll for the badge. */
    @GetMapping("/unread-count")
    public CountDto unread() {
        return new CountDto(inbox.unreadForUser(CurrentUser.id()));
    }

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void read(@PathVariable UUID id) {
        inbox.markReadForUser(CurrentUser.id(), id);
    }

    @PostMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void readAll() {
        inbox.markAllReadForUser(CurrentUser.id());
    }

    public record CountDto(long count) {
    }

    public record InboxDto(long unread, List<ItemDto> items) {
    }

    public record ItemDto(UUID id, String kind, UUID bookingId, UUID refId, Long number, String actor, Instant createdAt,
                          boolean read) {
        static ItemDto of(InboxNotification n) {
            return new ItemDto(n.getId(), n.getKind().name(), n.getBookingId(), n.getRefId(), n.getNumber(), n.getActor(),
                    n.getCreatedAt(), n.getReadAt() != null);
        }
    }
}
