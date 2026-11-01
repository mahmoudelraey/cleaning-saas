package com.fieldops.app.billing;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Base64;

/**
 * ZATCA phase-1 ("generation") QR payload for simplified tax invoices: Base64 of a TLV sequence
 * (tag, length, UTF-8 value) with 1 seller name, 2 VAT number, 3 timestamp, 4 total incl. VAT, 5 VAT.
 *
 * <p>Phase 2 ("integration": cryptographic stamp, XML, reporting to the Fatoora platform) is NOT covered;
 * it is the plan's v2 item and is usually done through an accredited provider.
 */
public final class ZatcaQr {

    private ZatcaQr() {
    }

    public static String encode(String sellerName, String vatNumber, Instant issuedAt, long totalHalalas, long vatHalalas) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        tlv(out, 1, sellerName);
        tlv(out, 2, vatNumber);
        tlv(out, 3, DateTimeFormatter.ISO_INSTANT.format(issuedAt.truncatedTo(ChronoUnit.SECONDS)));
        tlv(out, 4, amount(totalHalalas));
        tlv(out, 5, amount(vatHalalas));
        return Base64.getEncoder().encodeToString(out.toByteArray());
    }

    static String amount(long halalas) {
        long abs = Math.abs(halalas);
        return (halalas < 0 ? "-" : "") + (abs / 100) + "." + String.format("%02d", abs % 100);
    }

    private static void tlv(ByteArrayOutputStream out, int tag, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 255) {
            throw new IllegalArgumentException("TLV value too long for tag " + tag);
        }
        out.write(tag);
        out.write(bytes.length);
        out.write(bytes, 0, bytes.length);
    }
}
