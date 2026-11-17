package com.fieldops.portal.config;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.fieldops.app.customerportal.CustomerPortalService;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

/**
 * Every {@code /api/portal/{slug}/**} call: the company must exist, be usable and have the customer portal in its
 * plan ({@code booking_page}); otherwise 404 (problem+json {@code not_found}). Covers signed-in customers too,
 * whose requests are answered from their token without looking the company up again.
 */
@Component
public class PortalAccessInterceptor implements HandlerInterceptor {

    private final CustomerPortalService portal;

    public PortalAccessInterceptor(CustomerPortalService portal) {
        this.portal = portal;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        Object vars = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (vars instanceof Map<?, ?> m && m.get("slug") instanceof String slug) {
            portal.company(slug); // throws ApiException 404 when the portal is not available
        }
        return true;
    }
}
