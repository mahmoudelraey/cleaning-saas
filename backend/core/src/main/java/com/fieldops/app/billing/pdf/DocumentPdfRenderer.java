package com.fieldops.app.billing.pdf;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.EnumMap;
import java.util.Map;

import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfGState;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPCellEvent;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPTableEvent;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfTemplate;
import com.lowagie.text.pdf.PdfWriter;

/**
 * Renders an Arabic-first (RTL) A4 invoice or quote with OpenPDF, in the bilingual teal design: company on the right,
 * the document title, number pill and dates on the left, a tinted "bill to" card, a table with a dark teal header,
 * a totals card with the grand total highlighted, and a thank-you line over soft waves at the bottom.
 *
 * <p>The IBM Plex Sans Arabic font is embedded (OFL licence, see resources/fonts/OFL.txt) so the PDF looks the same
 * everywhere; OpenPDF shapes Arabic letters itself when the run direction is RTL. Icons and the ZATCA QR are drawn
 * as vector shapes (no image files, crisp at any zoom).
 *
 * <p>Thread-safe: fonts are created per document from cached bytes.
 */
public class DocumentPdfRenderer {

    private static final Color NAVY = new Color(0x16, 0x23, 0x3A);
    private static final Color INK = new Color(0x2A, 0x33, 0x45);
    private static final Color MUTED = new Color(0x6B, 0x72, 0x80);
    private static final Color TEAL = new Color(0x0B, 0x7A, 0x6A);
    private static final Color TEAL_TEXT = new Color(0x0E, 0x8C, 0x78);
    private static final Color TEAL_LINE = new Color(0x3A, 0x98, 0x8B);
    private static final Color MINT = new Color(0xDF, 0xF4, 0xF0);
    private static final Color MINT_SOFT = new Color(0xEC, 0xF8, 0xF5);
    private static final Color BOX = new Color(0xF7, 0xF9, 0xFA);
    private static final Color RULE = new Color(0xE1, 0xE7, 0xEC);
    private static final Color EN_TEXT = new Color(0x34, 0x50, 0x8F);

    /** Left-to-right embedding … pop: keeps phone numbers, VAT numbers and amounts in visual order. */
    public static final char LRE = '‪';
    public static final char PDF_MARK = '‬';

    /*
     * In an RTL cell OpenPDF treats horizontal alignment as start/end: ALIGN_LEFT puts text at the right
     * edge (the start of an RTL line) and ALIGN_RIGHT at the left. Every cell here is RTL, so name them by
     * where the text really lands.
     */
    private static final int RIGHT = Element.ALIGN_LEFT;
    private static final int LEFT = Element.ALIGN_RIGHT;

    private static final float RADIUS = 9f;

    private final byte[] regular;
    private final byte[] bold;

    public DocumentPdfRenderer() {
        this.regular = resource("/fonts/IBMPlexSansArabic-Regular.ttf");
        this.bold = resource("/fonts/IBMPlexSansArabic-Bold.ttf");
    }

    public static String ltr(String s) {
        return s == null || s.isEmpty() ? s : LRE + s + PDF_MARK;
    }

    public byte[] render(PdfModel m) {
        try {
            Fonts f = new Fonts(
                    BaseFont.createFont("IBMPlexSansArabic-Regular.ttf", BaseFont.IDENTITY_H, BaseFont.EMBEDDED, true, regular, null),
                    BaseFont.createFont("IBMPlexSansArabic-Bold.ttf", BaseFont.IDENTITY_H, BaseFont.EMBEDDED, true, bold, null));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            // Large bottom margin: the thank-you line and the waves live there.
            Document doc = new Document(PageSize.A4, 36, 36, 34, 118);
            PdfWriter writer = PdfWriter.getInstance(doc, out);
            writer.setPageEvent(new Decorations(f, m.stamp()));
            doc.addTitle(m.titleEn() + " " + m.number());
            doc.addCreator("FieldOps");
            doc.open();
            Icons icons = new Icons(writer.getDirectContent());

            doc.add(header(m, f, icons));
            doc.add(spacer(14));
            doc.add(parties(m, f));
            doc.add(spacer(16));
            doc.add(lines(m, f));
            doc.add(spacer(16));
            doc.add(summary(m, f, writer));
            doc.close();
            return out.toByteArray();
        } catch (DocumentException | IOException e) {
            throw new IllegalStateException("Could not render PDF", e);
        }
    }

    // ---------------------------------------------------------------------------------------------

    private record Fonts(BaseFont regular, BaseFont bold) {
        Font r(float size, Color c) {
            return new Font(regular, size, Font.NORMAL, c);
        }

        Font b(float size, Color c) {
            return new Font(bold, size, Font.NORMAL, c);
        }
    }

    private PdfPTable header(PdfModel m, Fonts f, Icons icons) throws IOException {
        PdfPTable t = rtlTable(2, new float[] {56, 44});

        // Right: company name, address and phone.
        PdfPTable company = rtlTable(1, new float[] {100});
        if (m.logo() != null) {
            try {
                Image logo = Image.getInstance(m.logo());
                logo.scaleToFit(110, 50);
                PdfPCell c = new PdfPCell(logo, false);
                plain(c);
                c.setHorizontalAlignment(RIGHT);
                c.setPaddingBottom(6);
                company.addCell(c);
            } catch (RuntimeException | IOException ignored) {
                // A broken logo must never stop an invoice from being produced.
            }
        }
        company.addCell(text(m.seller().name(), f.b(20, NAVY), RIGHT, 6));
        for (PdfModel.Field d : m.seller().details()) {
            Phrase p = new Phrase();
            Image icon = d.label().contains("Address") ? icons.pin(TEAL_TEXT)
                    : d.label().contains("Phone") ? icons.phone(TEAL_TEXT) : null;
            if (icon != null) {
                p.add(new Chunk(icon, 0, -1.5f, true));
                p.add(new Chunk("  ", f.r(10, MUTED)));
            }
            p.add(new Chunk(d.label() + ": " + d.value(), f.r(10, MUTED)));
            PdfPCell c = cell(p, RIGHT, 3);
            company.addCell(c);
        }
        PdfPCell right = new PdfPCell(company);
        plain(right);
        t.addCell(right);

        // Left: document title, number pill and dates.
        PdfPTable meta = rtlTable(1, new float[] {100});
        meta.addCell(text(m.titleAr(), f.b(26, TEAL_TEXT), LEFT, 0));
        // English title in the same teal bold as the Arabic; smaller when long ("Simplified Tax Invoice").
        float enSize = m.titleEn().length() > 12 ? 18 : 24;
        PdfPCell en = text(ltr(m.titleEn()), f.b(enSize, TEAL_TEXT), LEFT, 8);
        meta.addCell(en);

        String number = "رقم / No.: " + ltr(m.number());
        Font numberFont = f.b(12, NAVY);
        PdfPCell pill = text(number, numberFont, LEFT, 7);
        pill.setPaddingTop(5);
        pill.setPaddingLeft(14);
        float pillWidth = numberFont.getBaseFont().getWidthPoint(number, 12) + 34;
        pill.setCellEvent(new Pill(MINT, pillWidth));
        meta.addCell(pill);
        meta.addCell(text(" ", f.r(4, INK), LEFT, 0));

        for (PdfModel.Field d : m.meta()) {
            Phrase p = new Phrase();
            p.add(new Chunk(d.label() + ": " + d.value(), f.r(10, INK)));
            p.add(new Chunk("  ", f.r(10, INK)));
            p.add(new Chunk(icons.calendar(TEAL_TEXT), 0, -1.5f, true));
            meta.addCell(cell(p, LEFT, 3));
        }
        PdfPCell left = new PdfPCell(meta);
        plain(left);
        t.addCell(left);

        PdfPCell rule = new PdfPCell(new Phrase(" "));
        plain(rule);
        rule.setColspan(2);
        rule.setFixedHeight(10);
        rule.setBorder(Rectangle.BOTTOM);
        rule.setBorderColor(TEAL);
        rule.setBorderWidth(1.6f);
        t.addCell(rule);
        return t;
    }

    /** The customer in a tinted card on the right. */
    private PdfPTable parties(PdfModel m, Fonts f) {
        PdfPTable t = rtlTable(2, new float[] {48, 52});
        PdfPTable box = rtlTable(1, new float[] {100});
        box.addCell(text(m.customer().heading(), f.b(11, TEAL_TEXT), RIGHT, 3));
        box.addCell(text(m.customer().name(), f.b(14, NAVY), RIGHT, 4));
        for (PdfModel.Field d : m.customer().details()) {
            box.addCell(text(d.label() + ": " + d.value(), f.r(10, INK), RIGHT, 2));
        }
        PdfPCell c = new PdfPCell(box);
        plain(c);
        c.setPadding(12);
        c.setPaddingBottom(14);
        c.setCellEvent(new RoundFill(MINT_SOFT, null, true, true));
        t.addCell(c);
        PdfPCell empty = new PdfPCell(new Phrase(" "));
        plain(empty);
        t.addCell(empty);
        return t;
    }

    private PdfPTable lines(PdfModel m, Fonts f) {
        PdfPTable t = rtlTable(5, new float[] {7, 45, 12, 18, 18});
        t.setHeaderRows(1);
        t.setTableEvent(new LinesFrame());
        String[] heads = {"#", "الوصف\nDescription", "الكمية\nQty", "سعر الوحدة\nUnit price", "الإجمالي\nAmount"};
        for (int i = 0; i < heads.length; i++) {
            PdfPCell c = text(heads[i], f.b(10, Color.WHITE), Element.ALIGN_CENTER, 8);
            c.setPaddingTop(6);
            c.setPaddingLeft(4);
            c.setPaddingRight(4);
            c.setVerticalAlignment(Element.ALIGN_MIDDLE);
            separator(c, i < heads.length - 1, TEAL_LINE);
            t.addCell(c);
        }
        int i = 1;
        int last = m.lines().size();
        for (PdfModel.Line l : m.lines()) {
            boolean bottom = i < last;
            t.addCell(row(ltr(String.valueOf(i++)), f.b(11, NAVY), Element.ALIGN_CENTER, bottom, true));
            t.addCell(description(l, f, bottom));
            t.addCell(row(ltr(l.quantity()), f.b(11, NAVY), Element.ALIGN_CENTER, bottom, true));
            t.addCell(row(ltr(l.unitPrice()), f.b(11, NAVY), Element.ALIGN_CENTER, bottom, true));
            t.addCell(row(ltr(l.total()), f.b(11, NAVY), Element.ALIGN_CENTER, bottom, false));
        }
        return t;
    }

    /** Notes and QR on the right; the totals card on the left. */
    private PdfPTable summary(PdfModel m, Fonts f, PdfWriter writer) throws DocumentException {
        PdfPTable t = rtlTable(2, new float[] {44, 56});
        t.setKeepTogether(true);

        PdfPTable side = rtlTable(1, new float[] {100});
        if (m.notes() != null && !m.notes().isBlank()) {
            side.addCell(text("ملاحظات / Notes", f.b(10, TEAL_TEXT), RIGHT, 3));
            side.addCell(text(m.notes(), f.r(9.5f, INK), RIGHT, 8));
        }
        if (m.qrPayload() != null) {
            PdfPCell qr = new PdfPCell(qrImage(writer, m.qrPayload(), 92), false);
            plain(qr);
            qr.setHorizontalAlignment(RIGHT);
            qr.setPaddingTop(4);
            side.addCell(qr);
        }
        PdfPCell sc = new PdfPCell(side);
        plain(sc);
        sc.setPaddingLeft(16);
        t.addCell(sc);

        // Totals card: plain rows on a light background, then the grand total on mint.
        PdfPTable rows = rtlTable(2, new float[] {62, 38});
        int n = m.totals().size();
        for (int i = 0; i < n; i++) {
            PdfModel.Field fld = m.totals().get(i);
            boolean line = i < n - 1;
            rows.addCell(totalCell(fld.label(), f.r(10.5f, INK), RIGHT, line));
            rows.addCell(totalCell(ltr(fld.value()), f.b(12, NAVY), LEFT, line));
        }
        PdfPTable grand = rtlTable(2, new float[] {58, 42});
        grand.addCell(grandCell(m.grandTotal().label(), f.b(13, NAVY), RIGHT));
        grand.addCell(grandCell(ltr(m.grandTotal().value()), f.b(17, TEAL), LEFT));

        PdfPTable card = rtlTable(1, new float[] {100});
        PdfPCell top = new PdfPCell(rows);
        plain(top);
        top.setPaddingTop(4);
        top.setPaddingBottom(4);
        top.setCellEvent(new RoundFill(BOX, null, true, false));
        card.addCell(top);
        PdfPCell bottom = new PdfPCell(grand);
        plain(bottom);
        bottom.setBorder(Rectangle.TOP);
        bottom.setBorderColor(TEAL);
        bottom.setBorderWidth(1.6f);
        bottom.setCellEvent(new RoundFill(MINT, null, false, true));
        card.addCell(bottom);

        PdfPCell tc = new PdfPCell(card);
        plain(tc);
        t.addCell(tc);
        return t;
    }

    /** QR as vector modules (crisp at any zoom, no AWT). */
    private Image qrImage(PdfWriter writer, String payload, float size) throws DocumentException {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            hints.put(EncodeHintType.MARGIN, 0);
            BitMatrix matrix = new QRCodeWriter().encode(payload, com.google.zxing.BarcodeFormat.QR_CODE, 0, 0, hints);
            int n = matrix.getWidth();
            float module = size / n;
            PdfTemplate tpl = writer.getDirectContent().createTemplate(size, size);
            tpl.setColorFill(Color.BLACK);
            for (int y = 0; y < n; y++) {
                for (int x = 0; x < n; x++) {
                    if (matrix.get(x, y)) {
                        tpl.rectangle(x * module, size - (y + 1) * module, module + 0.01f, module + 0.01f);
                    }
                }
            }
            tpl.fill();
            return Image.getInstance(tpl);
        } catch (WriterException e) {
            throw new DocumentException(e);
        }
    }

    // ---------------------------------------------------------------------------------------------

    private static PdfPTable rtlTable(int cols, float[] widths) {
        PdfPTable t = new PdfPTable(cols);
        t.setWidthPercentage(100);
        try {
            // Widths are applied left-to-right on the page while RTL cells fill right-to-left; callers
            // pass widths in reading (cell) order, so reverse them.
            float[] visual = new float[widths.length];
            for (int i = 0; i < widths.length; i++) {
                visual[i] = widths[widths.length - 1 - i];
            }
            t.setWidths(visual);
        } catch (DocumentException e) {
            throw new IllegalArgumentException(e);
        }
        t.setRunDirection(PdfWriter.RUN_DIRECTION_RTL);
        t.getDefaultCell().setBorder(Rectangle.NO_BORDER);
        return t;
    }

    private static PdfPCell text(String s, Font font, int align, float padBottom) {
        return cell(new Phrase(s == null ? "" : s, font), align, padBottom);
    }

    private static PdfPCell cell(Phrase p, int align, float padBottom) {
        PdfPCell c = new PdfPCell(p);
        plain(c);
        c.setHorizontalAlignment(align);
        c.setPaddingBottom(padBottom);
        c.setUseAscender(true);
        return c;
    }

    /** A body cell of the lines table: line under it (except the last row), divider to its left (except Amount). */
    private static PdfPCell row(String s, Font font, int align, boolean bottom, boolean divider) {
        PdfPCell c = text(s, font, align, 11);
        c.setPaddingTop(9);
        c.setPaddingLeft(6);
        c.setPaddingRight(6);
        c.setVerticalAlignment(Element.ALIGN_MIDDLE);
        separator(c, divider, RULE);
        if (bottom) {
            c.setBorder(c.getBorder() | Rectangle.BOTTOM);
            c.setBorderColorBottom(RULE);
            c.setBorderWidthBottom(0.8f);
        }
        return c;
    }

    /** A thin vertical line on the cell's left edge (between this column and the next one in reading order). */
    private static void separator(PdfPCell c, boolean on, Color color) {
        c.setUseVariableBorders(true);
        if (on) {
            c.setBorder(Rectangle.LEFT);
            c.setBorderColorLeft(color);
            c.setBorderWidthLeft(0.8f);
        } else {
            c.setBorder(Rectangle.NO_BORDER);
        }
    }

    /** Arabic description, and under it the English one (when there is one). */
    private static PdfPCell description(PdfModel.Line l, Fonts f, boolean bottom) {
        PdfPCell c = row(l.description(), f.r(11.5f, NAVY), RIGHT, bottom, true);
        c.setPaddingRight(14);
        String en = l.descriptionEn();
        if (en != null && !en.isBlank() && !en.equals(l.description())) {
            Phrase p = new Phrase();
            p.add(new Chunk(l.description(), f.r(11.5f, NAVY)));
            p.add(Chunk.NEWLINE);
            p.add(new Chunk(ltr(en), f.r(9.5f, EN_TEXT)));
            c.setPhrase(p);
        }
        return c;
    }

    private static PdfPCell totalCell(String s, Font font, int align, boolean line) {
        PdfPCell c = text(s, font, align, 8);
        c.setPaddingTop(6);
        if (align == RIGHT) {
            c.setPaddingRight(14);
        } else {
            c.setPaddingLeft(14);
        }
        c.setVerticalAlignment(Element.ALIGN_MIDDLE);
        if (line) {
            c.setBorder(Rectangle.BOTTOM);
            c.setBorderColor(RULE);
            c.setBorderWidth(0.8f);
        }
        return c;
    }

    private static PdfPCell grandCell(String s, Font font, int align) {
        PdfPCell c = text(s, font, align, 11);
        c.setPaddingTop(9);
        if (align == RIGHT) {
            c.setPaddingRight(14);
        } else {
            c.setPaddingLeft(14);
        }
        c.setVerticalAlignment(Element.ALIGN_MIDDLE);
        return c;
    }

    private static void plain(PdfPCell c) {
        c.setBorder(Rectangle.NO_BORDER);
        c.setPadding(0);
        c.setRunDirection(PdfWriter.RUN_DIRECTION_RTL);
    }

    private static PdfPTable spacer(float h) {
        PdfPTable t = new PdfPTable(1);
        t.setWidthPercentage(100);
        PdfPCell c = new PdfPCell(new Phrase(" "));
        c.setBorder(Rectangle.NO_BORDER);
        c.setFixedHeight(h);
        t.addCell(c);
        return t;
    }

    private static byte[] resource(String path) {
        try (InputStream in = DocumentPdfRenderer.class.getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("Missing resource " + path);
            }
            return in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    // --------------------------------------------------------------------------------- shapes

    /** Rounded background and/or outline behind a cell; either end can be left square to join the next cell. */
    private record RoundFill(Color fill, Color stroke, boolean roundTop, boolean roundBottom) implements PdfPCellEvent {
        @Override
        public void cellLayout(PdfPCell cell, Rectangle r, PdfContentByte[] canvases) {
            float x = r.getLeft();
            float y = r.getBottom();
            float w = r.getWidth();
            float h = r.getHeight();
            if (fill != null) {
                PdfContentByte cb = canvases[PdfPTable.BACKGROUNDCANVAS];
                cb.saveState();
                cb.setColorFill(fill);
                cb.roundRectangle(x, y, w, h, RADIUS);
                if (!roundTop) {
                    cb.rectangle(x, y + h - RADIUS, w, RADIUS);
                }
                if (!roundBottom) {
                    cb.rectangle(x, y, w, RADIUS);
                }
                cb.fill();
                cb.restoreState();
            }
            if (stroke != null) {
                PdfContentByte cb = canvases[PdfPTable.LINECANVAS];
                cb.saveState();
                cb.setColorStroke(stroke);
                cb.setLineWidth(0.8f);
                cb.roundRectangle(x, y, w, h, RADIUS);
                cb.stroke();
                cb.restoreState();
            }
        }
    }

    /** The number pill: a rounded tint only as wide as its text, at the cell's left edge. */
    private record Pill(Color fill, float width) implements PdfPCellEvent {
        @Override
        public void cellLayout(PdfPCell cell, Rectangle r, PdfContentByte[] canvases) {
            PdfContentByte cb = canvases[PdfPTable.BACKGROUNDCANVAS];
            cb.saveState();
            cb.setColorFill(fill);
            cb.roundRectangle(r.getLeft(), r.getBottom(), Math.min(width, r.getWidth()), r.getHeight(), 8);
            cb.fill();
            cb.restoreState();
        }
    }

    /** Lines table: dark teal header with rounded top corners and a rounded outline around the whole table. */
    private static final class LinesFrame implements PdfPTableEvent {
        @Override
        public void tableLayout(PdfPTable table, float[][] widths, float[] heights, int headerRows, int rowStart,
                                PdfContentByte[] canvases) {
            float x0 = widths[0][0];
            float x1 = widths[0][widths[0].length - 1];
            float top = heights[0];
            float bottom = heights[heights.length - 1];
            PdfContentByte bg = canvases[PdfPTable.BACKGROUNDCANVAS];
            bg.saveState();
            if (headerRows > 0 && heights.length > 1) {
                float headBottom = heights[1];
                bg.setColorFill(TEAL);
                bg.roundRectangle(x0, headBottom, x1 - x0, top - headBottom, RADIUS);
                bg.rectangle(x0, headBottom, x1 - x0, Math.min(RADIUS, top - headBottom));
                bg.fill();
            }
            bg.restoreState();
            PdfContentByte line = canvases[PdfPTable.LINECANVAS];
            line.saveState();
            line.setColorStroke(RULE);
            line.setLineWidth(0.9f);
            line.roundRectangle(x0, bottom, x1 - x0, top - bottom, RADIUS);
            line.stroke();
            line.restoreState();
        }
    }

    /** Small vector icons (phone, map pin, calendar), 10pt square, drawn once per document. */
    private static final class Icons {
        private final PdfContentByte cb;

        Icons(PdfContentByte cb) {
            this.cb = cb;
        }

        Image phone(Color c) {
            PdfTemplate t = cb.createTemplate(10, 10);
            t.setColorFill(c);
            t.setColorStroke(c);
            // Earpiece and mouthpiece joined by the curve of the handset.
            t.roundRectangle(0.4f, 6.6f, 3.2f, 3.0f, 0.9f);
            t.roundRectangle(6.6f, 0.4f, 3.0f, 3.2f, 0.9f);
            t.fill();
            t.setLineWidth(2.1f);
            t.arc(1.6f, 1.6f, 15.4f, 15.4f, 180, 90);
            t.stroke();
            return image(t);
        }

        Image pin(Color c) {
            PdfTemplate t = cb.createTemplate(10, 10);
            t.setColorFill(c);
            t.circle(5, 6.4f, 3.5f);
            t.fill();
            t.moveTo(1.9f, 5.2f);
            t.lineTo(8.1f, 5.2f);
            t.lineTo(5, 0.2f);
            t.closePath();
            t.fill();
            t.setColorFill(Color.WHITE);
            t.circle(5, 6.4f, 1.4f);
            t.fill();
            return image(t);
        }

        Image calendar(Color c) {
            PdfTemplate t = cb.createTemplate(10, 10);
            t.setColorStroke(c);
            t.setColorFill(c);
            t.setLineWidth(0.9f);
            t.roundRectangle(0.8f, 0.6f, 8.4f, 8.0f, 1.2f);
            t.stroke();
            t.rectangle(0.8f, 6.2f, 8.4f, 2.4f);
            t.fill();
            t.rectangle(2.6f, 8.2f, 1.0f, 1.6f);
            t.rectangle(6.4f, 8.2f, 1.0f, 1.6f);
            for (int row = 0; row < 2; row++) {
                for (int col = 0; col < 3; col++) {
                    t.rectangle(2.1f + col * 2.3f, 1.9f + row * 2.0f, 1.2f, 1.1f);
                }
            }
            t.fill();
            return image(t);
        }

        private static Image image(PdfTemplate t) {
            try {
                return Image.getInstance(t);
            } catch (DocumentException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    /** Waves, leaves and the thank-you line at the bottom of every page, and the diagonal status stamp. */
    private static final class Decorations extends PdfPageEventHelper {
        private final Fonts f;
        private final String stamp;

        Decorations(Fonts f, String stamp) {
            this.f = f;
            this.stamp = stamp;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            Rectangle page = document.getPageSize();
            float w = page.getWidth();
            PdfContentByte under = writer.getDirectContentUnder();
            leaves(under, w);
            waves(under, w);

            PdfContentByte cb = writer.getDirectContent();
            String thanks = "شكرًا لاختياركم خدماتنا";
            Font big = f.b(15, NAVY);
            float tw = big.getBaseFont().getWidthPoint(thanks, 15);
            float cx = w / 2;
            float y = 76;
            ColumnText.showTextAligned(cb, Element.ALIGN_CENTER, new Phrase(thanks, big), cx, y, 0,
                    PdfWriter.RUN_DIRECTION_RTL, 0);
            cb.saveState();
            cb.setColorStroke(TEAL);
            cb.setLineWidth(1f);
            float gap = tw / 2 + 14;
            cb.moveTo(cx - gap, y + 5);
            cb.lineTo(cx - gap - 120, y + 5);
            cb.moveTo(cx + gap, y + 5);
            cb.lineTo(cx + gap + 120, y + 5);
            cb.stroke();
            cb.restoreState();
            ColumnText.showTextAligned(cb, Element.ALIGN_CENTER, new Phrase("Thank you for your business",
                    f.r(10.5f, INK)), cx, y - 18, 0, PdfWriter.RUN_DIRECTION_NO_BIDI, 0);
            if (writer.getPageNumber() > 1) {
                ColumnText.showTextAligned(cb, Element.ALIGN_LEFT, new Phrase(ltr(String.valueOf(writer.getPageNumber())),
                        f.r(8, Color.WHITE)), 36, 12, 0, PdfWriter.RUN_DIRECTION_NO_BIDI, 0);
            }

            if (stamp != null) {
                cb.saveState();
                PdfGState gs = new PdfGState();
                gs.setFillOpacity(0.12f);
                cb.setGState(gs);
                Color color = stamp.contains("VOID") || stamp.contains("REJECTED") ? Color.RED : TEAL;
                // One line per language: OpenPDF drops part of a rotated mixed-direction line.
                String[] parts = stamp.split("\\|");
                float scx = page.getWidth() / 2;
                float scy = page.getHeight() / 2;
                for (int i = 0; i < parts.length; i++) {
                    double offset = (i - (parts.length - 1) / 2.0) * 82;
                    float x = (float) (scx + offset * Math.sin(Math.toRadians(35)));
                    float sy = (float) (scy - offset * Math.cos(Math.toRadians(35)));
                    ColumnText.showTextAligned(cb, Element.ALIGN_CENTER, new Phrase(parts[i].trim(), f.b(60, color)),
                            x, sy, 35, PdfWriter.RUN_DIRECTION_RTL, 0);
                }
                cb.restoreState();
            }
        }

        /** Three layered teal waves along the bottom edge. */
        private static void waves(PdfContentByte cb, float w) {
            wave(cb, w, new Color(0x9F, 0xDD, 0xD2), 0.55f, 46, 18, 58);
            wave(cb, w, new Color(0x4F, 0xBF, 0xAE), 0.75f, 30, 40, 12);
            wave(cb, w, TEAL, 0.9f, 16, 6, 30);
        }

        private static void wave(PdfContentByte cb, float w, Color c, float opacity, float left, float mid, float right) {
            cb.saveState();
            PdfGState gs = new PdfGState();
            gs.setFillOpacity(opacity);
            cb.setGState(gs);
            cb.setColorFill(c);
            cb.moveTo(0, 0);
            cb.lineTo(0, left);
            cb.curveTo(w * 0.3f, left + 14, w * 0.45f, mid - 10, w * 0.62f, mid);
            cb.curveTo(w * 0.8f, mid + 8, w * 0.92f, right - 6, w, right);
            cb.lineTo(w, 0);
            cb.closePath();
            cb.fill();
            cb.restoreState();
        }

        /** Soft translucent leaves in the bottom-right corner. */
        private static void leaves(PdfContentByte cb, float w) {
            cb.saveState();
            PdfGState gs = new PdfGState();
            gs.setFillOpacity(0.35f);
            cb.setGState(gs);
            cb.setColorFill(MINT_SOFT);
            leaf(cb, w - 70, 30, w - 20, 240, 60);
            leaf(cb, w - 150, 30, w - 95, 210, 52);
            leaf(cb, w - 40, 30, w + 40, 170, 46);
            cb.restoreState();
        }

        private static void leaf(PdfContentByte cb, float bx, float by, float tx, float ty, float bulge) {
            cb.moveTo(bx, by);
            cb.curveTo(bx - bulge, by + (ty - by) * 0.45f, tx - bulge * 0.6f, ty - 20, tx, ty);
            cb.curveTo(tx + bulge * 0.4f, ty - (ty - by) * 0.4f, bx + bulge * 0.6f, by + 30, bx, by);
            cb.closePath();
            cb.fill();
        }
    }
}
