package com.fieldops.app.billing;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Global map: unguessable token → (tenant, document). Lets end customers open their invoice/quote. */
@Entity
@Table(name = "public_links")
public class PublicLink {

    public enum Type {
        INVOICE, QUOTE
    }

    @Id
    private String token;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false, updatable = false)
    private Type documentType;

    @Column(name = "document_id", nullable = false, updatable = false)
    private UUID documentId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected PublicLink() {
    }

    public PublicLink(String token, UUID tenantId, Type type, UUID documentId, Instant createdAt) {
        this.token = token;
        this.tenantId = tenantId;
        this.documentType = type;
        this.documentId = documentId;
        this.createdAt = createdAt;
    }

    public String getToken() {
        return token;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public Type getDocumentType() {
        return documentType;
    }

    public UUID getDocumentId() {
        return documentId;
    }
}
