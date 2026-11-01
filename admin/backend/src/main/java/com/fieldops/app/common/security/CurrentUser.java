package com.fieldops.app.common.security;

import java.util.UUID;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** Static access to the authenticated staff user (from the JWT). */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static UUID idOrNull() {
        Jwt jwt = jwtOrNull();
        return jwt == null ? null : UUID.fromString(jwt.getSubject());
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
        return Role.valueOf(jwt.getClaimAsString(JwtService.ROLE_CLAIM));
    }

    /** Display name from the token, or null for system/public actions. */
    public static String nameOrNull() {
        Jwt jwt = jwtOrNull();
        return jwt == null ? null : jwt.getClaimAsString(JwtService.NAME_CLAIM);
    }

    public static Role roleOrNull() {
        Jwt jwt = jwtOrNull();
        return jwt == null ? null : Role.valueOf(jwt.getClaimAsString(JwtService.ROLE_CLAIM));
    }

    private static Jwt jwtOrNull() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth instanceof JwtAuthenticationToken token ? token.getToken() : null;
    }
}
