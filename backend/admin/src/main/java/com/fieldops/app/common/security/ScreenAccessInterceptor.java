package com.fieldops.app.common.security;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.fieldops.app.common.web.ApiException;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Coordinators only reach the APIs of the screens their owner allowed (Team page). The first matching rule
 * decides; requests no rule matches are not limited here (role checks still apply).
 *
 * <p>Reads that other screens depend on stay open to them: e.g. the booking form searches customers, a
 * booking's page shows its invoice and messages, the dashboard counts bookings and customers.
 */
@Component
public class ScreenAccessInterceptor implements HandlerInterceptor {

    private record Rule(String method, Pattern path, Set<Screen> anyOf) {
        boolean matches(String m, String p) {
            return (method == null || method.equals(m)) && path.matcher(p).matches();
        }
    }

    private static Rule rule(String method, String regex, Screen first, Screen... rest) {
        return new Rule(method, Pattern.compile(regex), EnumSet.of(first, rest));
    }

    private static final String ID = "[^/]+";

    private static final List<Rule> RULES = List.of(
            // Finance
            rule("GET", "/api/v1/reports(/.*)?", Screen.REPORTS),
            // Analytics: sales has its own screen; the records behind a chart and exports serve both pages.
            rule("GET", "/api/v1/analytics/sales", Screen.SALES),
            rule("GET", "/api/v1/analytics/(records|export)", Screen.REPORTS, Screen.SALES),
            rule(null, "/api/v1/analytics(/.*)?", Screen.REPORTS),
            rule(null, "/api/v1/expenses(/.*)?", Screen.EXPENSES),
            rule("GET", "/api/v1/bookings/" + ID + "/invoices", Screen.INVOICES, Screen.BOOKINGS),
            rule(null, "/api/v1/bookings/" + ID + "/invoice", Screen.INVOICES),
            rule(null, "/api/v1/invoices(/.*)?", Screen.INVOICES),
            rule(null, "/api/v1/bookings/" + ID + "/quote", Screen.QUOTES),
            rule(null, "/api/v1/quotes(/.*)?", Screen.QUOTES),
            // Customer messages, contact requests, reviews
            rule("GET", "/api/v1/notifications", Screen.MESSAGES, Screen.BOOKINGS),
            rule(null, "/api/v1/bookings/" + ID + "/messages", Screen.MESSAGES, Screen.BOOKINGS),
            rule(null, "/api/v1/contact-messages(/.*)?", Screen.CONTACT_REQUESTS),
            rule(null, "/api/v1/reviews(/.*)?", Screen.REVIEWS),
            // Calendar and bookings
            rule("GET", "/api/v1/scheduling(/.*)?", Screen.CALENDAR, Screen.BOOKINGS),
            rule("GET", "/api/v1/bookings(/.*)?", Screen.BOOKINGS, Screen.CALENDAR, Screen.CUSTOMERS, Screen.DASHBOARD),
            rule(null, "/api/v1/bookings(/.*)?", Screen.BOOKINGS, Screen.CALENDAR),
            // Customers (searched by the booking and billing forms)
            rule("GET", "/api/v1/customers(/.*)?", Screen.CUSTOMERS, Screen.BOOKINGS, Screen.CALENDAR, Screen.INVOICES,
                    Screen.QUOTES, Screen.DASHBOARD),
            rule(null, "/api/v1/customers(/.*)?", Screen.CUSTOMERS, Screen.BOOKINGS),
            // Technicians: everyone reads the list (assigning visits); changes need the screen
            rule("GET", "/api/v1/technicians(/.*)?", Screen.TECHNICIANS, Screen.BOOKINGS, Screen.CALENDAR,
                    Screen.DASHBOARD, Screen.REPORTS),
            rule(null, "/api/v1/technicians(/.*)?", Screen.TECHNICIANS));

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (CurrentUser.roleOrNull() != Role.COORDINATOR) {
            return true;
        }
        String path = request.getRequestURI().substring(request.getContextPath().length());
        String method = request.getMethod();
        if ("OPTIONS".equals(method)) {
            return true;
        }
        Set<Screen> mine = CurrentUser.screens();
        for (Rule r : RULES) {
            if (r.matches(method, path)) {
                if (r.anyOf().stream().anyMatch(mine::contains)) {
                    return true;
                }
                throw ApiException.forbidden("screen_not_allowed", "You don't have access to this screen");
            }
        }
        return true;
    }
}
