package com.fieldops.portal.security;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.fieldops.portal.config.PortalProperties;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Per-IP limit on sign-in calls. The admin backend also limits codes per phone and per company, but it
 * sees only the portal server's address, so the per-visitor limit has to live here.
 */
@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private final int perMinute;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public AuthRateLimitFilter(PortalProperties props) {
        this.perMinute = props.rateLimit().authPerMinute();
    }

    private static final class Window {
        long startedAt;
        int count;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().matches("/api/portal/[^/]+/auth/.*");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long now = System.currentTimeMillis();
        if (windows.size() > 50_000) {
            windows.clear(); // crude bound on memory; a restart-free reset is fine for a rate limit
        }
        Window w = windows.computeIfAbsent(request.getRemoteAddr(), k -> new Window());
        boolean allowed;
        synchronized (w) {
            if (now - w.startedAt > 60_000) {
                w.startedAt = now;
                w.count = 0;
            }
            allowed = ++w.count <= perMinute;
        }
        if (!allowed) {
            response.setStatus(429);
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.getWriter().write("{\"title\":\"Too Many Requests\",\"status\":429,\"code\":\"rate_limited\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
