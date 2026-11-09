package com.fieldops.app.tenant;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Company link rules (customer portal at {@code {portal}/{slug}}, booking page at {@code /book/{slug}}):
 * lowercase latin letters, digits and single hyphens, 3-40 chars, and not a path the apps use themselves.
 */
public final class Slugs {

    private static final Pattern VALID = Pattern.compile("^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$");

    private static final Set<String> RESERVED = Set.of(
            "www", "api", "app", "admin", "dashboard", "login", "signup", "help", "support", "status",
            "mail", "static", "assets", "cdn", "billing", "docs", "blog", "public", "book", "booking",
            "portal", "i18n", "media", "uploads", "health", "settings", "account", "logout");

    private Slugs() {
    }

    public static String normalize(String raw) {
        return raw == null ? null : raw.trim().toLowerCase(Locale.ROOT);
    }

    public static boolean isValid(String slug) {
        return slug != null && VALID.matcher(slug).matches() && !RESERVED.contains(slug);
    }
}
