package com.fieldops.app.analytics.export;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Minimal Office Open XML (.xlsx) writer: one worksheet per table, inline strings, real numbers with SAR and
 * percentage formats, a frozen header and right-to-left sheets for Arabic. No dependency beyond the JDK.
 */
public final class XlsxWriter {

    // Cell styles (index into cellXfs in styles.xml).
    private static final int S_TEXT = 0;
    private static final int S_HEADER = 1;
    private static final int S_MONEY = 2;
    private static final int S_INT = 3;
    private static final int S_PCT = 4;
    private static final int S_TITLE = 5;
    private static final int S_SUBTITLE = 6;

    private XlsxWriter() {
    }

    public static byte[] write(ReportBook book) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (ZipOutputStream zip = new ZipOutputStream(out, StandardCharsets.UTF_8)) {
                List<ReportBook.Table> tables = book.tables();
                put(zip, "[Content_Types].xml", contentTypes(tables.size()));
                put(zip, "_rels/.rels", """
                        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                        </Relationships>""");
                put(zip, "xl/workbook.xml", workbook(tables));
                put(zip, "xl/_rels/workbook.xml.rels", workbookRels(tables.size()));
                put(zip, "xl/styles.xml", STYLES);
                for (int i = 0; i < tables.size(); i++) {
                    put(zip, "xl/worksheets/sheet" + (i + 1) + ".xml", sheet(book, tables.get(i)));
                }
            }
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Could not write the Excel file", e);
        }
    }

    private static String contentTypes(int sheets) {
        StringBuilder s = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                <Default Extension="xml" ContentType="application/xml"/>
                <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
                """);
        for (int i = 1; i <= sheets; i++) {
            s.append("<Override PartName=\"/xl/worksheets/sheet").append(i)
                    .append(".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>");
        }
        return s.append("</Types>").toString();
    }

    private static String workbook(List<ReportBook.Table> tables) {
        StringBuilder s = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>""");
        Set<String> used = new HashSet<>();
        for (int i = 0; i < tables.size(); i++) {
            String name = sheetName(tables.get(i).sheetName(), i + 1);
            while (!used.add(name.toLowerCase())) {
                name = sheetName(name.substring(0, Math.min(name.length(), 27)) + " " + (i + 1), i + 1);
            }
            s.append("<sheet name=\"").append(xml(name)).append("\" sheetId=\"").append(i + 1)
                    .append("\" r:id=\"rId").append(i + 1).append("\"/>");
        }
        return s.append("</sheets></workbook>").toString();
    }

    private static String workbookRels(int sheets) {
        StringBuilder s = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">""");
        for (int i = 1; i <= sheets; i++) {
            s.append("<Relationship Id=\"rId").append(i)
                    .append("\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet")
                    .append(i).append(".xml\"/>");
        }
        s.append("<Relationship Id=\"rId").append(sheets + 1)
                .append("\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>");
        return s.append("</Relationships>").toString();
    }

    private static String sheet(ReportBook book, ReportBook.Table t) {
        StringBuilder s = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""");
        s.append("<sheetViews><sheetView workbookViewId=\"0\"").append(book.rtl() ? " rightToLeft=\"1\"" : "")
                .append("><pane ySplit=\"4\" topLeftCell=\"A5\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>");
        s.append("<cols>");
        for (int i = 0; i < t.headers().size(); i++) {
            int w = i < t.widths().size() ? t.widths().get(i) : 16;
            s.append("<col min=\"").append(i + 1).append("\" max=\"").append(i + 1).append("\" width=\"").append(w)
                    .append("\" customWidth=\"1\"/>");
        }
        s.append("</cols><sheetData>");
        int r = 1;
        s.append(row(r++, List.of(t.title()), S_TITLE));
        s.append(row(r++, List.of(book.title() + " · " + book.subtitle()), S_SUBTITLE));
        r++; // blank line
        s.append(row(r++, List.copyOf(t.headers()), S_HEADER));
        for (List<Object> values : t.rows()) {
            s.append(row(r++, values, -1));
        }
        return s.append("</sheetData></worksheet>").toString();
    }

    private static String row(int r, List<?> values, int style) {
        StringBuilder s = new StringBuilder("<row r=\"").append(r).append("\">");
        for (int c = 0; c < values.size(); c++) {
            Object v = values.get(c);
            if (v == null) {
                continue;
            }
            String ref = col(c) + r;
            if (v instanceof ReportBook.Money m) {
                s.append("<c r=\"").append(ref).append("\" s=\"").append(S_MONEY).append("\"><v>")
                        .append(java.math.BigDecimal.valueOf(m.halalas(), 2).toPlainString()).append("</v></c>");
            } else if (v instanceof ReportBook.Pct p) {
                s.append("<c r=\"").append(ref).append("\" s=\"").append(S_PCT).append("\"><v>")
                        .append(p.fraction()).append("</v></c>");
            } else if (v instanceof Number n) {
                s.append("<c r=\"").append(ref).append("\" s=\"").append(S_INT).append("\"><v>")
                        .append(n.longValue()).append("</v></c>");
            } else {
                s.append("<c r=\"").append(ref).append("\" t=\"inlineStr\" s=\"").append(style < 0 ? S_TEXT : style)
                        .append("\"><is><t xml:space=\"preserve\">").append(xml(v.toString())).append("</t></is></c>");
            }
        }
        return s.append("</row>").toString();
    }

    private static String col(int index) {
        StringBuilder s = new StringBuilder();
        int n = index + 1;
        while (n > 0) {
            int rem = (n - 1) % 26;
            s.insert(0, (char) ('A' + rem));
            n = (n - 1) / 26;
        }
        return s.toString();
    }

    private static String sheetName(String name, int index) {
        String clean = name == null ? "" : name.replaceAll("[\\[\\]:*?/\\\\]", " ").trim();
        if (clean.isEmpty()) {
            clean = "Sheet " + index;
        }
        return clean.length() > 31 ? clean.substring(0, 31) : clean;
    }

    static String xml(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                default -> {
                    // Drop characters XML 1.0 does not allow (control characters other than tab/newline).
                    if (ch >= 0x20 || ch == '\t' || ch == '\n' || ch == '\r') {
                        out.append(ch);
                    }
                }
            }
        }
        return out.toString();
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static final String STYLES = """
            <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
            <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
            <numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
            <fonts count="4">
              <font><sz val="11"/><name val="Calibri"/></font>
              <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
              <font><b/><sz val="14"/><color rgb="FF0F766E"/><name val="Calibri"/></font>
              <font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
            </fonts>
            <fills count="3">
              <fill><patternFill patternType="none"/></fill>
              <fill><patternFill patternType="gray125"/></fill>
              <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
            </fills>
            <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
            <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
            <cellXfs count="7">
              <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
              <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
              <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
              <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
              <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
              <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
              <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
            </cellXfs>
            <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
            </styleSheet>""";
}
