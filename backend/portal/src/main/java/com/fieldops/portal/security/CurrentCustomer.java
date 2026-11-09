package com.fieldops.portal.security;

import java.util.UUID;

import com.fieldops.app.common.web.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** The signed-in customer, taken only from the verified token (never from the request body or path). */
public record CurrentCustomer(UUID tenantId, String slug, UUID customerId, String phone, String name) {

    /**
     * The caller, who must belong to the company in the URL.
     * @param needCustomer true for everything except finishing first-time registration
     */
    public static CurrentCustomer require(String pathSlug, boolean needCustomer) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwtAuth)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthorized", "Sign in first");
        }
        Jwt jwt = jwtAuth.getToken();
        String slug = jwt.getClaimAsString(CustomerTokenService.SLUG);
        if (slug == null || !slug.equalsIgnoreCase(pathSlug)) {
            throw ApiException.forbidden("wrong_company", "This sign-in belongs to another company");
        }
        String cid = jwt.getClaimAsString(CustomerTokenService.CUSTOMER);
        if (needCustomer && cid == null) {
            throw ApiException.forbidden("profile_required", "Tell us your name first");
        }
        return new CurrentCustomer(UUID.fromString(jwt.getClaimAsString(CustomerTokenService.TENANT)), slug,
                cid == null ? null : UUID.fromString(cid), jwt.getClaimAsString(CustomerTokenService.PHONE),
                jwt.getClaimAsString(CustomerTokenService.NAME));
    }

    public static CurrentCustomer require(String pathSlug) {
        return require(pathSlug, true);
    }

    /** The signed-in customer of this company, or null for a visitor (public endpoints that accept both). */
    public static CurrentCustomer optional(String pathSlug) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken)) {
            return null;
        }
        try {
            return require(pathSlug, false);
        } catch (ApiException e) {
            return null; // signed in with another company: treat as a visitor here
        }
    }
}
