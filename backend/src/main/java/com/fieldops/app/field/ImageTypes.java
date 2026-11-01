package com.fieldops.app.field;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;

/**
 * Detects the real image type from the file's first bytes. The client's declared content type and
 * file name are ignored, so an HTML or script file renamed to .jpg is rejected.
 */
public final class ImageTypes {

    public record Detected(String contentType, String extension) {
    }

    private ImageTypes() {
    }

    public static Optional<Detected> detect(byte[] head) {
        if (head.length >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF) {
            return Optional.of(new Detected("image/jpeg", "jpg"));
        }
        if (head.length >= 8 && Arrays.equals(Arrays.copyOf(head, 8),
                new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A})) {
            return Optional.of(new Detected("image/png", "png"));
        }
        if (head.length >= 12 && ascii(head, 0, 4).equals("RIFF") && ascii(head, 8, 4).equals("WEBP")) {
            return Optional.of(new Detected("image/webp", "webp"));
        }
        if (head.length >= 12 && ascii(head, 4, 4).equals("ftyp")) {
            String brand = ascii(head, 8, 4);
            if (brand.equals("heic") || brand.equals("heix") || brand.equals("mif1") || brand.equals("msf1")) {
                return Optional.of(new Detected("image/heic", "heic"));
            }
        }
        return Optional.empty();
    }

    private static String ascii(byte[] b, int offset, int len) {
        return new String(b, offset, len, StandardCharsets.US_ASCII);
    }
}
