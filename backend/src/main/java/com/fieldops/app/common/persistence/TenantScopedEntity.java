package com.fieldops.app.common.persistence;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;

import org.hibernate.annotations.TenantId;

/**
 * Base for every tenant-owned table. Hibernate sets {@code tenant_id} on insert from
 * {@link com.fieldops.app.common.tenant.TenantContext} and filters every read by it.
 * There is deliberately no setter: application code never chooses the tenant.
 */
@MappedSuperclass
public abstract class TenantScopedEntity extends BaseEntity {

    @TenantId
    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    public UUID getTenantId() {
        return tenantId;
    }
}
