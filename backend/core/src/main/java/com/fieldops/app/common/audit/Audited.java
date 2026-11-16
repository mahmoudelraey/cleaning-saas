package com.fieldops.app.common.audit;

import com.fasterxml.jackson.annotation.JsonUnwrapped;

/**
 * A response item with its audit info: serialized as the item's own fields plus {@code "audit": {...}}, so list
 * endpoints gain "created by / updated by" without changing every DTO.
 */
public record Audited<T>(@JsonUnwrapped T item, AuditInfo audit) {
}
