package com.fieldops.app.common.security;

import java.io.IOException;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Server-side enforcement of "change your temporary password first": while the access token carries
 * {@link JwtService#PASSWORD_CHANGE_CLAIM}, only the endpoints needed to change the password (and sign
 * out) are reachable. The UI redirects too, but this is what actually blocks the API.
 */
@Component
public class PasswordChangeFilter extends OncePerRequestFilter {

    private static final Set<String> ALLOWED = Set.of(
            "/api/v1/auth/change-password", "/api/v1/auth/me", "/api/v1/auth/logout");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt
                && Boolean.TRUE.equals(jwt.getToken().getClaimAsBoolean(JwtService.PASSWORD_CHANGE_CLAIM))
                && !allowed(request)) {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.getWriter().write("{\"title\":\"Forbidden\",\"status\":403,\"code\":\"password_change_required\","
                    + "\"detail\":\"Change your temporary password first\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private static boolean allowed(HttpServletRequest request) {
        String path = request.getRequestURI();
        return ALLOWED.contains(path) || ("GET".equals(request.getMethod()) && path.equals("/api/v1/tenant"));
    }
}
