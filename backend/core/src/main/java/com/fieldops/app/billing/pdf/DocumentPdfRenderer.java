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
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfTemplate;
import com.lowagie.text.pdf.PdfWriter;

/**
 * Renders an Arabic-first (RTL) A4 invoice or quote with OpenPDF. The IBM Plex Sans Arabic font is
 * embedded (OFL licence, see resources/fonts/OFL.txt) so the PDF looks the same everywhere; OpenPDF
 * shapes Arabic letters itself when the run direction is RTL. The ZATCA QR is drawn as vector squares.
 *
 * <p>Thread-safe: fonts are created per document from cached bytes.
 */
public class DocumentPdfRenderer {

    private static final Color INK = new Color(0x1F, 0x29, 0x37);
    private static final Color MUTED = new Color(0x6B, 0x72, 0x80);
    private static final Color ACCENT = new Color(0x0F, 0x76, 0x6E);
    private static final Color RULE = new Color(0xE5, 0xE7, 0xEB);
    private static final Color HEAD_BG = new Color(0xF0, 0xFD, 0xFA);

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
            Document doc = new Document(PageSize.A4, 36, 36, 36, 48);
            PdfWriter writer = PdfWriter.getInstance(doc, out);
            writer.setPageEvent(new Decorations(f, m.stamp(), m.footer()));
            doc.addTitle(m.titleEn() + " " + m.number());
            doc.addCreator("FieldOps");
            doc.open();

            doc.add(header(m, f));
            doc.add(spacer(10));
            doc.add(parties(m, f));
            doc.add(spacer(12));
            doc.add(lines(m, f));
            doc.add(spacer(10));
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

    private PdfPTable header(PdfModel m, Fonts f) throws IOException {
        PdfPTable t = rtlTable(2, new float[] {55, 45});

        // Right: company
        PdfPTable company = rtlTable(1, new float[] {100});
        if (m.logo() != null) {
            try {
                Image logo = Image.getInstance(m.logo());
                logo.scaleToFit(120, 56);
                PdfPCell c = new PdfPCell(logo, false);
                plain(c);
                c.setHorizontalAlignment(RIGHT);
                c.setPaddingBottom(6);
                company.addCell(c);
            } catch (RuntimeException | IOException ignored) {
                // A broken logo must never stop an invoice from being produced.
            }
        }
        company.addCell(text(m.seller().name(), f.b(14, INK), RIGHT, 0));
        for (PdfModel.Field d : m.seller().details()) {
            company.addCell(text(d.label() + ": " + d.value(), f.r(8.5f, MUTED), RIGHT, 1));
        }
        PdfPCell left = new PdfPCell(company);
        plain(left);
        t.addCell(left);

        // Left: document title and meta
        PdfPTable meta = rtlTable(1, new float[] {100});
        meta.addCell(text(m.titleAr(), f.b(17, ACCENT), LEFT, 0));
        meta.addCell(text(m.titleEn(), f.r(9, MUTED), LEFT, 2));
        meta.addCell(text("رقم / No.: " + ltr(m.number()), f.b(10, INK), LEFT, 2));
        for (PdfModel.Field d : m.meta()) {
            meta.addCell(text(d.label() + ": " + d.value(), f.r(9, INK), LEFT, 1));
        }
        PdfPCell right = new PdfPCell(meta);
        plain(right);
        t.addCell(right);

        PdfPCell rule = new PdfPCell(new Phrase(" "));
        plain(rule);
        rule.setColspan(2);
        rule.setFixedHeight(8);
        rule.setBorder(Rectangle.BOTTOM);
        rule.setBorderColor(ACCENT);
        rule.setBorderWidth(1.2f);
        t.addCell(rule);
        return t;
    }

    private PdfPTable parties(PdfModel m, Fonts f) {
        PdfPTable t = rtlTable(1, new float[] {100});
        PdfPTable box = rtlTable(1, new float[] {100});
        box.addCell(text(m.customer().heading(), f.b(9, ACCENT), RIGHT, 2));
        box.addCell(text(m.customer().name(), f.b(11, INK), RIGHT, 2));
        for (PdfModel.Field d : m.customer().details()) {
            box.addCell(text(d.label() + ": " + d.value(), f.r(9, INK), RIGHT, 1));
        }
        PdfPCell c = new PdfPCell(box);
        c.setBorderColor(RULE);
        c.setPadding(8);
        c.setRunDirection(PdfWriter.RUN_DIRECTION_RTL);
        t.addCell(c);
        return t;
    }

    private PdfPTable lines(PdfModel m, Fonts f) {
        PdfPTable t = rtlTable(5, new float[] {6, 48, 12, 17, 17});
        t.setHeaderRows(1);
        for (String h : new String[] {"#", "الوصف\nDescription", "الكمية\nQty", "سعر الوحدة\nUnit price", "الإجمالي\nAmount"}) {
            PdfPCell c = text(h, f.b(8.5f, INK), Element.ALIGN_CENTER, 5);
            c.setPaddingTop(4);
            c.setPaddingLeft(3);
            c.setPaddingRight(3);
            c.setBackgroundColor(HEAD_BG);
            c.setBorder(Rectangle.BOTTOM);
            c.setBorderColor(ACCENT);
            t.addCell(c);
        }
        int i = 1;
        for (PdfModel.Line l : m.lines()) {
            t.addCell(row(ltr(String.valueOf(i++)), f.r(9, MUTED), Element.ALIGN_CENTER));
            t.addCell(description(l, f));
            t.addCell(row(ltr(l.quantity()), f.r(9.5f, INK), Element.ALIGN_CENTER));
            t.addCell(row(ltr(l.unitPrice()), f.r(9.5f, INK), Element.ALIGN_CENTER));
            t.addCell(row(ltr(l.total()), f.r(9.5f, INK), Element.ALIGN_CENTER));
        }
        return t;
    }

    private PdfPTable summary(PdfModel m, Fonts f, PdfWriter writer) throws DocumentException {
        PdfPTable t = rtlTable(2, new float[] {50, 50});
        t.setKeepTogether(true);

        // Right: notes
        PdfPTable notes = rtlTable(1, new float[] {100});
        if (m.notes() != null && !m.notes().isBlank()) {
            notes.addCell(text("ملاحظات / Notes", f.b(9, ACCENT), RIGHT, 2));
            notes.addCell(text(m.notes(), f.r(9, INK), RIGHT, 2));
        }
        PdfPCell nc = new PdfPCell(notes);
        plain(nc);
        nc.setPaddingLeft(12);
        t.addCell(nc);

        // Left: totals then QR
        PdfPTable totals = rtlTable(2, new float[] {58, 42});
        for (PdfModel.Field fld : m.totals()) {
            totals.addCell(totalCell(fld.label(), f.r(9, MUTED), RIGHT, false));
            totals.addCell(totalCell(ltr(fld.value()), f.r(9.5f, INK), LEFT, false));
        }
        totals.addCell(totalCell(m.grandTotal().label(), f.b(10.5f, INK), RIGHT, true));
        totals.addCell(totalCell(ltr(m.grandTotal().value()), f.b(11, ACCENT), LEFT, true));

        if (m.qrPayload() != null) {
            PdfPCell qr = new PdfPCell(qrImage(writer, m.qrPayload(), 96), false);
            plain(qr);
            qr.setColspan(2);
            qr.setHorizontalAlignment(LEFT);
            qr.setPaddingTop(10);
            totals.addCell(qr);
        }
        PdfPCell tc = new PdfPCell(totals);
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
        PdfPCell c = new PdfPCell(new Phrase(s == null ? "" : s, font));
        plain(c);
        c.setHorizontalAlignment(align);
        c.setPaddingBottom(padBottom);
        c.setUseAscender(true);
        return c;
    }

    private static PdfPCell row(String s, Font font, int align) {
        PdfPCell c = text(s, font, align, 6);
        c.setPaddingTop(5);
        c.setPaddingLeft(3);
        c.setPaddingRight(3);
        c.setVerticalAlignment(Element.ALIGN_MIDDLE);
        c.setBorder(Rectangle.BOTTOM);
        c.setBorderColor(RULE);
        return c;
    }

    /** Arabic description, and under it the English one in smaller grey type (when there is one). */
    private static PdfPCell description(PdfModel.Line l, Fonts f) {
        PdfPCell c = row(l.description(), f.r(9.5f, INK), RIGHT);
        String en = l.descriptionEn();
        if (en != null && !en.isBlank() && !en.equals(l.description())) {
            Phrase p = new Phrase();
            p.add(new Chunk(l.description(), f.r(9.5f, INK)));
            p.add(Chunk.NEWLINE);
            p.add(new Chunk(ltr(en), f.r(8, MUTED)));
            c.setPhrase(p);
        }
        return c;
    }

    private static PdfPCell totalCell(String s, Font font, int align, boolean grand) {
        PdfPCell c = text(s, font, align, 5);
        c.setPaddingTop(4);
        if (grand) {
            c.setBorder(Rectangle.TOP);
            c.setBorderColor(INK);
            c.setBorderWidth(1f);
            c.setPaddingTop(6);
        }
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

    /** Footer (page x) and a diagonal "VOID"/"PAID" stamp. */
    private static final class Decorations extends PdfPageEventHelper {
        private final Fonts f;
        private final String stamp;
        private final String footer;

        Decorations(Fonts f, String stamp, String footer) {
            this.f = f;
            this.stamp = stamp;
            this.footer = footer;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfContentByte cb = writer.getDirectContent();
            Rectangle page = document.getPageSize();
            String text = (footer == null ? "" : footer + "   ·   ") + ltr(String.valueOf(writer.getPageNumber()));
            ColumnText.showTextAligned(cb, Element.ALIGN_CENTER, new Phrase(text, f.r(7.5f, MUTED)),
                    page.getWidth() / 2, 24, 0, PdfWriter.RUN_DIRECTION_RTL, 0);

            if (stamp != null) {
                cb.saveState();
                PdfGState gs = new PdfGState();
                gs.setFillOpacity(0.12f);
                cb.setGState(gs);
                Color color = stamp.contains("VOID") ? Color.RED : ACCENT;
                // One line per language: OpenPDF drops part of a rotated mixed-direction line.
                String[] parts = stamp.split("\\|");
                float cx = page.getWidth() / 2;
                float cy = page.getHeight() / 2;
                for (int i = 0; i < parts.length; i++) {
                    double offset = (i - (parts.length - 1) / 2.0) * 82;
                    float x = (float) (cx + offset * Math.sin(Math.toRadians(35)));
                    float y = (float) (cy - offset * Math.cos(Math.toRadians(35)));
                    ColumnText.showTextAligned(cb, Element.ALIGN_CENTER, new Phrase(parts[i].trim(), f.b(60, color)),
                            x, y, 35, PdfWriter.RUN_DIRECTION_RTL, 0);
                }
                cb.restoreState();
            }
        }
    }
}
