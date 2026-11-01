package com.fieldops.app.field;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** Metadata of a visit photo; the bytes live in {@link com.fieldops.app.common.storage.FileStorage}. */
@Entity
@Table(name = "media")
public class Media extends TenantScopedEntity {

    public enum Kind {
        BEFORE, AFTER, OTHER
    }

    @Column(name = "booking_id", nullable = false, updatable = false)
    private UUID bookingId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Kind kind;

    @Column(name = "storage_key", nullable = false, updatable = false, unique = true)
    private String storageKey;

    @Column(name = "content_type", nullable = false, updatable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false, updatable = false)
    private long sizeBytes;

    @Column(name = "uploaded_by_name", updatable = false)
    private String uploadedByName;

    protected Media() {
    }

    public Media(UUID bookingId, Kind kind, String storageKey, String contentType, long sizeBytes, String uploadedByName) {
        this.bookingId = bookingId;
        this.kind = kind;
        this.storageKey = storageKey;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.uploadedByName = uploadedByName;
    }

    public UUID getBookingId() {
        return bookingId;
    }

    public Kind getKind() {
        return kind;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getUploadedByName() {
        return uploadedByName;
    }
}
