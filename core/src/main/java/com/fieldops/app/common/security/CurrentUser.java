package com.fieldops.app.common.security;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** Static access to the authenticated user (from the JWT): staff in the admin app, a customer in the portal. */
public final class CurrentUser {

    /** Claim names shared by the staff tokens (admin) and the customer tokens (portal: name only). */
    public static final String ROLE_CLAIM = "role";
    public static final String NAME_CLAIM = "name";

    private CurrentUser() {
    }

    /** Staff user id; null for anonymous calls and for customer-portal tokens (they carry no role). */
    public static UUID idOrNull() {
        Jwt jwt = jwtOrNull();
        return jwt == null || jwt.getClaimAsString(ROLE_CLAIM) == null ? null : UUID.fromString(jwt.getSubject());
    }

    public static UUID id() {
        UUID id = idOrNull();
        if (id == null) {
            throw new IllegalStateException("No authenticated user");
        }
        return id;
    }

    public static Role role() {
        Jwt jwt = jwtOrNull();
        if (jwt == null) {
            throw new IllegalStateException("No authenticated user");
        }
        return Role.valueOf(jwt.getClaimAsString(ROLE_CLAIM));
    }

    /** Display name from the token, or null for system/public actions. */
    public static String nameOrNull() {
        Jwt jwt = jwtOrNull();
        return jwt == null ? null : jwt.getClaimAsString(NAME_CLAIM);
    }

    public static Role roleOrNull() {
        Jwt jwt = jwtOrNull();
        String role = jwt == null ? null : jwt.getClaimAsString(ROLE_CLAIM);
        return role == null ? null : Role.valueOf(role);
    }

    private static Jwt jwtOrNull() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth instanceof JwtAuthenticationToken token ? token.getToken() : null;
    }
}
