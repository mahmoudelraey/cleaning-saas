package com.fieldops.app.inbox;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.auth.User;
import com.fieldops.app.auth.UserRepository;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * In-app notifications: written by the app itself when something happens, read by the admin bell and the portal
 * bell, which poll. No outside notification service is involved.
 */
@Service
public class InboxService {

    static final int PAGE = 30;

    private final InboxRepository inbox;
    private final UserRepository users;
    private final Clock clock;

    public InboxService(InboxRepository inbox, UserRepository users, Clock clock) {
        this.inbox = inbox;
        this.users = users;
        this.clock = clock;
    }

    // --- writing (inside the caller's transaction, so it commits with the change) ------------------------------

    /** To the owners, and to the coordinators allowed to open the kind's screen. Never to the person who did it. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void toStaff(InboxKind kind, UUID bookingId, UUID refId, Long number, String actor, UUID exceptUserId) {
        UUID tenantId = TenantContext.require();
        for (User u : users.findByTenantIdOrderByNameAsc(tenantId)) {
            if (!u.isActive() || u.getId().equals(exceptUserId)) {
                continue;
            }
            boolean office = u.getRole() == Role.OWNER
                    || (u.getRole() == Role.COORDINATOR && (kind.screen() == null || u.getScreens().contains(kind.screen())));
            if (office) {
                inbox.save(InboxNotification.forUser(u.getId(), kind, bookingId, refId, number, actor));
            }
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void toCustomer(UUID customerId, InboxKind kind, UUID bookingId, UUID refId, Long number, String actor) {
        if (customerId != null) {
            inbox.save(InboxNotification.forCustomer(customerId, kind, bookingId, refId, number, actor));
        }
    }

    // --- reading -------------------------------------------------------------------------------------------

    public record Inbox(long unread, List<InboxNotification> items) {
    }

    @Transactional(readOnly = true)
    public Inbox forUser(UUID userId) {
        return new Inbox(inbox.countByUserIdAndReadAtIsNull(userId),
                inbox.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, PAGE)));
    }

    @Transactional(readOnly = true)
    public long unreadForUser(UUID userId) {
        return inbox.countByUserIdAndReadAtIsNull(userId);
    }

    @Transactional(readOnly = true)
    public Inbox forCustomer(UUID customerId) {
        return new Inbox(inbox.countByCustomerIdAndReadAtIsNull(customerId),
                inbox.findByCustomerIdOrderByCreatedAtDesc(customerId, PageRequest.of(0, PAGE)));
    }

    @Transactional(readOnly = true)
    public long unreadForCustomer(UUID customerId) {
        return inbox.countByCustomerIdAndReadAtIsNull(customerId);
    }

    @Transactional
    public void markReadForUser(UUID userId, UUID id) {
        InboxNotification n = inbox.findById(id).filter(x -> userId.equals(x.getUserId()))
                .orElseThrow(() -> ApiException.notFound("notification"));
        n.markRead(Instant.now(clock));
    }

    @Transactional
    public void markReadForCustomer(UUID customerId, UUID id) {
        InboxNotification n = inbox.findById(id).filter(x -> customerId.equals(x.getCustomerId()))
                .orElseThrow(() -> ApiException.notFound("notification"));
        n.markRead(Instant.now(clock));
    }

    @Transactional
    public void markAllReadForUser(UUID userId) {
        inbox.markAllReadForUser(userId, Instant.now(clock));
    }

    @Transactional
    public void markAllReadForCustomer(UUID customerId) {
        inbox.markAllReadForCustomer(customerId, Instant.now(clock));
    }
}
