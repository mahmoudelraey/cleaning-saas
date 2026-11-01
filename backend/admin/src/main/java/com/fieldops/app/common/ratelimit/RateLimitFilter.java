package com.fieldops.app.common.ratelimit;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Fixed-window, per-IP limiter for unauthenticated endpoints (login, signup, refresh, public booking, OTP).
 * In-memory is enough for a single instance; move to Postgres/Redis-backed buckets when scaling out.
 *
 * <p>Uses {@code getRemoteAddr()}. Behind a reverse proxy, set
 * {@code server.forward-headers-strategy=native} so it reflects the real client IP.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final long WINDOW_MS = 60_000;

    private final int limitPerMinute;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public RateLimitFilter(@Value("${app.rate-limit.public-per-minute:30}") int limitPerMinute) {
        this.limitPerMinute = limitPerMinute;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !(path.startsWith("/api/v1/auth/") || path.startsWith("/api/v1/public/"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long now = System.currentTimeMillis();
        String key = request.getRemoteAddr();
        Window w = windows.compute(key, (k, existing) ->
                existing == null || now - existing.startedAt >= WINDOW_MS ? new Window(now) : existing);

        if (w.count.incrementAndGet() > limitPerMinute) {
            long retryAfter = Math.max(1, (WINDOW_MS - (now - w.startedAt)) / 1000);
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", String.valueOf(retryAfter));
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.getWriter().write("{\"title\":\"Too Many Requests\",\"status\":429,\"code\":\"rate_limited\"}");
            return;
        }
        if (windows.size() > 50_000) {
            windows.entrySet().removeIf(e -> now - e.getValue().startedAt >= WINDOW_MS);
        }
        chain.doFilter(request, response);
    }

    /** For tests. */
    public void reset() {
        windows.clear();
    }

    private static final class Window {
        final long startedAt;
        final AtomicInteger count = new AtomicInteger();

        Window(long startedAt) {
            this.startedAt = startedAt;
        }
    }
}
