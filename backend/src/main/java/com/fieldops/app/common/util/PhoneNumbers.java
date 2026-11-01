package com.fieldops.app.common.util;

import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Normalizes Saudi mobile numbers to E.164 ({@code +9665XXXXXXXX}) so search, uniqueness and
 * WhatsApp delivery all use one format. Accepts 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, 009665..., +9665...,
 * with spaces/dashes and Arabic-Indic digits.
 */
public final class PhoneNumbers {

    private static final Pattern SAUDI_MOBILE = Pattern.compile("^5\\d{8}$");

    private PhoneNumbers() {
    }

    public static Optional<String> normalizeSaudiMobile(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String digits = toAsciiDigits(raw).replaceAll("[\\s\\-()]", "");
        if (digits.startsWith("+")) {
            digits = digits.substring(1);
        }
        if (digits.startsWith("00")) {
            digits = digits.substring(2);
        }
        if (digits.startsWith("966")) {
            digits = digits.substring(3);
        }
        if (digits.startsWith("0")) {
            digits = digits.substring(1);
        }
        return SAUDI_MOBILE.matcher(digits).matches() ? Optional.of("+966" + digits) : Optional.empty();
    }

    /** "+966512345678" → "+966 51 234 5678" for printing; anything else is returned unchanged. */
    public static String display(String e164) {
        if (e164 == null) {
            return "";
        }
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^\\+966(5\\d)(\\d{3})(\\d{4})$").matcher(e164);
        return m.matches() ? "+966 " + m.group(1) + " " + m.group(2) + " " + m.group(3) : e164;
    }

    /** Converts Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits to ASCII. */
    public static String toAsciiDigits(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (char c : s.toCharArray()) {
            if (c >= '٠' && c <= '٩') {
                sb.append((char) ('0' + (c - '٠')));
            } else if (c >= '۰' && c <= '۹') {
                sb.append((char) ('0' + (c - '۰')));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
