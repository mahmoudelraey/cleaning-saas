package com.fieldops.app.common.tenant;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Single source of truth for "which company is this request acting for".
 *
 * <p>Order of resolution:
 * <ol>
 *   <li>An explicit override set by trusted server code via {@link #runAs} (signup, public booking
 *       page resolved from the slug, scheduled jobs).</li>
 *   <li>The {@code tid} claim of the authenticated JWT. Never a header, path or body value.</li>
 *   <li>{@link #NO_TENANT}: a UUID that matches no rows, so missing context fails closed.</li>
 * </ol>
 */
public final class TenantContext {

    public static final String TENANT_CLAIM = "tid";

    /** Matches no tenant. Used when nothing is resolved so queries return nothing instead of everything. */
    public static final UUID NO_TENANT = new UUID(0L, 0L);

    private static final ThreadLocal<UUID> OVERRIDE = new ThreadLocal<>();

    private TenantContext() {
    }

    public static Optional<UUID> current() {
        UUID override = OVERRIDE.get();
        if (override != null) {
            return Optional.of(override);
        }
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            String tid = jwtAuth.getToken().getClaimAsString(TENANT_CLAIM);
            if (tid != null) {
                return Optional.of(UUID.fromString(tid));
            }
        }
        return Optional.empty();
    }

    public static UUID currentOrNone() {
        return current().orElse(NO_TENANT);
    }

    public static UUID require() {
        return current().orElseThrow(() -> new IllegalStateException("No tenant in context"));
    }

    /** Run trusted server-side code on behalf of a tenant. Restores the previous value afterwards. */
    public static <T> T runAs(UUID tenantId, Supplier<T> work) {
        UUID previous = OVERRIDE.get();
        OVERRIDE.set(tenantId);
        try {
            return work.get();
        } finally {
            if (previous == null) {
                OVERRIDE.remove();
            } else {
                OVERRIDE.set(previous);
            }
        }
    }

    public static void runAs(UUID tenantId, Runnable work) {
        runAs(tenantId, () -> {
            work.run();
            return null;
        });
    }
}
