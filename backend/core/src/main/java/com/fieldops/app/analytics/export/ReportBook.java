package com.fieldops.app.analytics.export;

import java.util.List;

/**
 * A report as a list of titled tables, rendered both to Excel ({@link XlsxWriter}) and PDF
 * ({@link ReportPdfRenderer}) so the two exports always carry the same numbers.
 *
 * <p>Cell values: {@link String}, {@link Long}/{@link Integer} (counts), {@link Money} (halalas, shown in SAR),
 * {@link Pct} (a fraction, shown as a percentage) or null (empty).
 */
public record ReportBook(String title, String subtitle, boolean rtl, List<Table> tables) {

    /** @param inPdf false for long record lists that only make sense in Excel */
    public record Table(String sheetName, String title, List<String> headers, List<Integer> widths,
                        List<List<Object>> rows, boolean inPdf) {
    }

    public record Money(long halalas) {
    }

    public record Pct(double fraction) {
    }

    public static Money money(Long halalas) {
        return halalas == null ? null : new Money(halalas);
    }

    public static Pct pct(Double fraction) {
        return fraction == null ? null : new Pct(fraction);
    }
}
