package com.fieldops.app.catalog;

import java.time.Duration;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Public: a service's photo, for the company's page in the customer portal. */
@RestController
public class ServiceImagePublicController {

    private final ServiceImageService images;

    public ServiceImagePublicController(ServiceImageService images) {
        this.images = images;
    }

    @GetMapping("/api/v1/public/services/{tenantId}/{serviceId}/image")
    public ResponseEntity<byte[]> image(@PathVariable UUID tenantId, @PathVariable UUID serviceId) {
        return images.load(tenantId, serviceId)
                .map(i -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(i.contentType()))
                        // The address changes with every upload (?v=), so it can be cached for long.
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                        .header("X-Content-Type-Options", "nosniff")
                        .body(i.bytes()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
