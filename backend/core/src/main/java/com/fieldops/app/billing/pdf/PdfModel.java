package com.fieldops.app.billing.pdf;

import java.util.List;

/**
 * Everything printed on an invoice or quote, already formatted (strings) so the renderer has no
 * business logic. Amounts are formatted SAR strings like "1,250.00".
 */
public record PdfModel(
        String titleAr,
        String titleEn,
        String number,
        List<Field> meta,
        Party seller,
        Party customer,
        List<Line> lines,
        List<Field> totals,
        Field grandTotal,
        String qrPayload,
        String notes,
        String stamp,
        byte[] logo,
        String footer) {

    /** A labelled value; label is bilingual "عربي / English". */
    public record Field(String label, String value) {
    }

    public record Party(String heading, String name, List<Field> details) {
    }

    /** {@code descriptionEn} is printed under the Arabic {@code description}; null = Arabic only. */
    public record Line(String description, String descriptionEn, String quantity, String unitPrice, String total) {
    }
}
