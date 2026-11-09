package com.fieldops.app.tenant;

/**
 * What the owner writes for the company's public page in the customer portal. Every field is optional;
 * an empty one hides its part of the page. Social fields hold the account name without the {@code @}.
 */
public record PublicPage(String headline, String about, String areas, String hours, String whatsapp,
                         String instagram, String x, String snapchat, String tiktok,
                         Integer foundedYear, Integer teamSize, String promises, String facebook) {
}
