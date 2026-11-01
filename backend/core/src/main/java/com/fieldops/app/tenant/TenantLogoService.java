package com.fieldops.app.tenant;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Optional;
import java.util.UUID;

import com.fieldops.app.common.storage.FileStorage;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.field.ImageTypes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

/** Company logo shown on invoices, quotes and the public booking page. JPEG or PNG only (PDF-embeddable). */
@Service
public class TenantLogoService {

    private static final Logger log = LoggerFactory.getLogger(TenantLogoService.class);
    public static final long MAX_BYTES = 2L * 1024 * 1024;

    private final TenantService tenants;
    private final FileStorage storage;

    public TenantLogoService(TenantService tenants, FileStorage storage) {
        this.tenants = tenants;
        this.storage = storage;
    }

    public record Logo(byte[] bytes, String contentType) {
    }

    @Transactional
    public Tenant upload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("file_required", "Choose an image");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "file_too_large", "Logo is larger than 2 MB");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("upload_failed", "Could not read the uploaded file");
        }
        ImageTypes.Detected type = ImageTypes.detect(bytes)
                .filter(d -> d.contentType().equals("image/png") || d.contentType().equals("image/jpeg"))
                .orElseThrow(() -> ApiException.badRequest("unsupported_file", "Logo must be a PNG or JPEG image"));

        Tenant t = tenants.current();
        String key = t.getId() + "/logo/" + UUID.randomUUID() + "." + type.extension();
        storage.put(key, new ByteArrayInputStream(bytes), bytes.length, type.contentType());
        String old = t.replaceLogo(key);
        afterCompletion(key, old);
        return t;
    }

    @Transactional
    public Tenant remove() {
        Tenant t = tenants.current();
        String old = t.replaceLogo(null);
        afterCompletion(null, old);
        return t;
    }

    /** Logo bytes for a tenant (used by PDFs); empty when none or unreadable. */
    public Optional<Logo> load(Tenant t) {
        if (t.getLogoKey() == null) {
            return Optional.empty();
        }
        try (InputStream in = storage.get(t.getLogoKey())) {
            String type = t.getLogoKey().endsWith(".png") ? "image/png" : "image/jpeg";
            return Optional.of(new Logo(in.readAllBytes(), type));
        } catch (IOException | RuntimeException e) {
            log.warn("Could not read logo {}", t.getLogoKey(), e);
            return Optional.empty();
        }
    }

    /** On commit delete the replaced file; on rollback delete the new one. */
    private void afterCompletion(String added, String replaced) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                String victim = status == STATUS_COMMITTED ? replaced : added;
                if (victim != null) {
                    try {
                        storage.delete(victim);
                    } catch (RuntimeException e) {
                        log.warn("Could not delete stored file {}", victim, e);
                    }
                }
            }
        });
    }
}
