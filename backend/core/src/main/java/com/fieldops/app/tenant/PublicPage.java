package com.fieldops.app.tenant;

/**
 * What the owner writes for the company's public page in the customer portal. Every field is optional;
 * an empty one hides its part of the page. Social fields hold the account name without the {@code @}.
 * {@code headline}/{@code about} are Arabic; {@code headlineEn}/{@code aboutEn} are their English versions.
 */
public record PublicPage(String headline, String about, String areas, String hours, String whatsapp,
                         String instagram, String x, String snapchat, String tiktok,
                         Integer foundedYear, Integer teamSize, String promises, String facebook,
                         String headlineEn, String aboutEn, String promisesEn, String areasEn, String hoursEn) {

    /** With the English headline and "about us" only. */
    public PublicPage(String headline, String about, String areas, String hours, String whatsapp, String instagram,
                      String x, String snapchat, String tiktok, Integer foundedYear, Integer teamSize, String promises,
                      String facebook, String headlineEn, String aboutEn) {
        this(headline, about, areas, hours, whatsapp, instagram, x, snapchat, tiktok, foundedYear, teamSize, promises,
                facebook, headlineEn, aboutEn, null, null, null);
    }

    /** Without the English texts (kept for callers that only deal with the Arabic page). */
    public PublicPage(String headline, String about, String areas, String hours, String whatsapp, String instagram,
                      String x, String snapchat, String tiktok, Integer foundedYear, Integer teamSize, String promises,
                      String facebook) {
        this(headline, about, areas, hours, whatsapp, instagram, x, snapchat, tiktok, foundedYear, teamSize, promises,
                facebook, null, null, null, null, null);
    }
}
