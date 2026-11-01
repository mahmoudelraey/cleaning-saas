package com.fieldops.app.billing;

import java.util.EnumMap;
import java.util.Map;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

/**
 * A QR code as an SVG path ({@code <svg viewBox="0 0 size size"><path d="…"/></svg>}), so the web app can
 * draw the ZATCA QR without a JavaScript QR library and without injecting HTML.
 */
public record QrPath(int size, String d) {

    public static QrPath of(String payload) {
        if (payload == null) {
            return null;
        }
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN, 0);
            BitMatrix m = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 0, 0, hints);
            int n = m.getWidth();
            StringBuilder d = new StringBuilder();
            for (int y = 0; y < n; y++) {
                int x = 0;
                while (x < n) {
                    if (!m.get(x, y)) {
                        x++;
                        continue;
                    }
                    int start = x;
                    while (x < n && m.get(x, y)) {
                        x++;
                    }
                    d.append('M').append(start).append(' ').append(y)
                            .append('h').append(x - start).append("v1h-").append(x - start).append('z');
                }
            }
            return new QrPath(n, d.toString());
        } catch (WriterException e) {
            throw new IllegalStateException(e);
        }
    }
}
