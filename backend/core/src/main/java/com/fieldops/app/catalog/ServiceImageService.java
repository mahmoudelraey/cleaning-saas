package com.fieldops.app.catalog;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Optional;
import java.util.UUID;

import com.fieldops.app.common.storage.FileStorage;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.field.ImageTypes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/** The photo of a service, shown on the company's public page. JPEG, PNG or WebP, up to 3 MB. */
@Service
public class ServiceImageService {

    private static final Logger log = LoggerFactory.getLogger(ServiceImageService.class);
    public static final long MAX_BYTES = 3L * 1024 * 1024;

    private final ServiceOfferingRepository services;
    private final FileStorage storage;
    private final TransactionTemplate tx;

    public ServiceImageService(ServiceOfferingRepository services, FileStorage storage, TransactionTemplate tx) {
        this.services = services;
        this.storage = storage;
        this.tx = tx;
    }

    public record Image(byte[] bytes, String contentType) {
    }

    @Transactional
    public ServiceOffering upload(UUID serviceId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("file_required", "Choose an image");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "file_too_large", "The image is larger than 3 MB");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("upload_failed", "Could not read the uploaded file");
        }
        ImageTypes.Detected type = ImageTypes.detect(bytes)
                .filter(d -> !d.contentType().equals("image/heic"))
                .orElseThrow(() -> ApiException.badRequest("unsupported_file", "Use a JPEG, PNG or WebP image"));

        ServiceOffering s = get(serviceId);
        String key = s.getTenantId() + "/services/" + s.getId() + "/" + UUID.randomUUID() + "." + type.extension();
        storage.put(key, new ByteArrayInputStream(bytes), bytes.length, type.contentType());
        String old = s.replaceImage(key);
        afterCompletion(key, old);
        return s;
    }

    @Transactional
    public ServiceOffering remove(UUID serviceId) {
        ServiceOffering s = get(serviceId);
        String old = s.replaceImage(null);
        afterCompletion(null, old);
        return s;
    }

    /** For the public page: the photo of a company's service (empty when it has none or it can't be read). */
    public Optional<Image> load(UUID tenantId, UUID serviceId) {
        String key = TenantContext.runAs(tenantId,
                () -> tx.execute(st -> services.findById(serviceId).map(ServiceOffering::getImageKey).orElse(null)));
        if (key == null) {
            return Optional.empty();
        }
        try (InputStream in = storage.get(key)) {
            String type = key.endsWith(".png") ? "image/png" : key.endsWith(".webp") ? "image/webp" : "image/jpeg";
            return Optional.of(new Image(in.readAllBytes(), type));
        } catch (IOException | RuntimeException e) {
            log.warn("Could not read service image {}", key, e);
            return Optional.empty();
        }
    }

    private ServiceOffering get(UUID id) {
        return services.findById(id).orElseThrow(() -> ApiException.notFound("service"));
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
