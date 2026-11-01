package com.fieldops.app.tenant;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.fieldops.app.common.tenant.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Enforces the subscription on every authenticated API request (runs right after JWT validation).
 * Without this, an already signed-in user would keep access until their access token expires.
 *
 * <p>While inactive, a company can still read its own status and the plans, and sign out,
 * so the UI can explain what happened and (from week 8) let the owner pay.
 */
@Component
public class TenantAccessFilter extends OncePerRequestFilter {

    private final TenantAccessService access;

    public TenantAccessFilter(TenantAccessService access) {
        this.access = access;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Optional<UUID> tenantId = TenantContext.current();
        if (tenantId.isPresent() && !allowedWhileInactive(request) && !access.isUsable(tenantId.get())) {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.getWriter().write("{\"title\":\"Forbidden\",\"status\":403,\"code\":\"subscription_inactive\","
                    + "\"detail\":\"Your subscription is not active\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private static boolean allowedWhileInactive(HttpServletRequest request) {
        String path = request.getRequestURI();
        boolean isGet = "GET".equals(request.getMethod());
        return (isGet && (path.equals("/api/v1/tenant") || path.equals("/api/v1/auth/me")))
                || path.equals("/api/v1/plans")
                || path.equals("/api/v1/auth/logout")
                || path.startsWith("/api/v1/billing/");
    }
}
