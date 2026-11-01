package com.fieldops.app.common.storage;

import java.io.InputStream;

/**
 * Object storage for uploaded files (photos, logos, generated PDFs). Keys are opaque paths like
 * {@code <tenantId>/media/<uuid>.jpg}; callers always build them with the tenant id first so a
 * bucket listing never mixes companies.
 */
public interface FileStorage {

    void put(String key, InputStream data, long size, String contentType);

    /** Caller must close the stream. Throws {@link StorageException} if the object does not exist. */
    InputStream get(String key);

    void delete(String key);

    class StorageException extends RuntimeException {
        public StorageException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
