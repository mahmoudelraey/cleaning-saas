package com.fieldops.app.review;

import java.time.Instant;
import java.util.UUID;

/**
 * A review with its customer and visit, for the admin list. Top-level on purpose: HQL {@code select new} only
 * resolves top-level class names.
 */
public record ReviewRow(UUID id, UUID bookingId, long bookingNumber, String customerName, int rating, String comment,
                        boolean published, Instant createdAt) {
}
