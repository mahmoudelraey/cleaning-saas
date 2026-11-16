package com.fieldops.app.common.audit;

import java.time.Instant;
import java.util.UUID;

/**
 * Who created / last changed a record and when, for the details view. A null {@code ...By} means the system or a
 * customer (portal, public booking page, background jobs); the names are the users' current names.
 */
public record AuditInfo(Instant createdAt, UUID createdBy, String createdByName,
                        Instant updatedAt, UUID updatedBy, String updatedByName) {
}
