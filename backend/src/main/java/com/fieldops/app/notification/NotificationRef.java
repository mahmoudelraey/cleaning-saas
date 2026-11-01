package com.fieldops.app.notification;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Global (not tenant-scoped) map from a provider's message id to the tenant that sent it, so
 * delivery callbacks, which carry no tenant, can be routed to the right company.
 */
@Entity
@Table(name = "notification_refs")
public class NotificationRef {

    @Id
    @Column(name = "provider_message_id")
    private String providerMessageId;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "notification_id", nullable = false)
    private UUID notificationId;

    protected NotificationRef() {
    }

    public NotificationRef(String providerMessageId, UUID tenantId, UUID notificationId) {
        this.providerMessageId = providerMessageId;
        this.tenantId = tenantId;
        this.notificationId = notificationId;
    }

    public String getProviderMessageId() {
        return providerMessageId;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getNotificationId() {
        return notificationId;
    }
}
