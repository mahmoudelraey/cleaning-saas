package com.fieldops.app.analytics.export;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.List;
import java.util.Locale;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

/**
 * Renders a {@link ReportBook} as an A4 landscape PDF (Arabic right-to-left or English left-to-right) with the
 * embedded IBM Plex Sans Arabic font, like the invoices. Long record lists are left to the Excel export.
 */
@Component
public class ReportPdfRenderer {

    private static final Color INK = new Color(0x1F, 0x29, 0x37);
    private static final Color MUTED = new Color(0x6B, 0x72, 0x80);
    private static final Color ACCENT = new Color(0x0F, 0x76, 0x6E);
    private static final Color RULE = new Color(0xE5, 0xE7, 0xEB);
    private static final Color ZEBRA = new Color(0xF8, 0xFA, 0xFC);
    private static final char LRE = '‪';
    private static final char PDF_MARK = '‬';

    private final byte[] regular;
    private final byte[] bold;

    public ReportPdfRenderer() {
        this.regular = resource("/fonts/IBMPlexSansArabic-Regular.ttf");
        this.bold = resource("/fonts/IBMPlexSansArabic-Bold.ttf");
    }

    public byte[] render(ReportBook book) {
        try {
            BaseFont r = BaseFont.createFont("IBMPlexSansArabic-Regular.ttf", BaseFont.IDENTITY_H, BaseFont.EMBEDDED,
                    true, regular, null);
            BaseFont b = BaseFont.createFont("IBMPlexSansArabic-Bold.ttf", BaseFont.IDENTITY_H, BaseFont.EMBEDDED,
                    true, bold, null);
            int dir = book.rtl() ? PdfWriter.RUN_DIRECTION_RTL : PdfWriter.RUN_DIRECTION_LTR;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            Document doc = new Document(PageSize.A4.rotate(), 30, 30, 30, 40);
            PdfWriter writer = PdfWriter.getInstance(doc, out);
            writer.setRunDirection(dir);
            writer.setPageEvent(new Footer(r, book.title(), book.rtl()));
            doc.addTitle(book.title());
            doc.addCreator("FieldOps");
            doc.open();

            doc.add(block(book.title(), new Font(b, 18, Font.NORMAL, ACCENT), dir, 2));
            doc.add(block(book.subtitle(), new Font(r, 10, Font.NORMAL, MUTED), dir, 12));

            for (ReportBook.Table t : book.tables()) {
                if (!t.inPdf()) {
                    continue;
                }
                PdfPTable heading = block(t.title(), new Font(b, 12, Font.NORMAL, INK), dir, 4);
                heading.setKeepTogether(true);
                doc.add(heading);
                doc.add(table(t, r, b, dir, book.rtl()));
            }
            doc.close();
            return out.toByteArray();
        } catch (DocumentException | IOException e) {
            throw new IllegalStateException("Could not render the report PDF", e);
        }
    }

    private static PdfPTable table(ReportBook.Table t, BaseFont r, BaseFont b, int dir, boolean rtl)
            throws DocumentException {
        int cols = t.headers().size();
        PdfPTable table = new PdfPTable(cols);
        table.setWidthPercentage(100);
        table.setRunDirection(dir);
        table.setHeaderRows(1);
        table.setSpacingAfter(14);
        float[] w = new float[cols];
        for (int i = 0; i < cols; i++) {
            float width = i < t.widths().size() ? t.widths().get(i) : 14;
            // Widths apply left-to-right on the page while RTL cells fill right-to-left: reverse for Arabic.
            w[rtl ? cols - 1 - i : i] = width;
        }
        table.setWidths(w);
        Font head = new Font(b, 9, Font.NORMAL, Color.WHITE);
        Font body = new Font(r, 9, Font.NORMAL, INK);
        for (String h : t.headers()) {
            PdfPCell c = cell(h, head, dir);
            c.setBackgroundColor(ACCENT);
            table.addCell(c);
        }
        int n = 0;
        for (List<Object> row : t.rows()) {
            for (int i = 0; i < cols; i++) {
                Object v = i < row.size() ? row.get(i) : null;
                PdfPCell c = cell(text(v), body, dir);
                if (v instanceof Number || v instanceof ReportBook.Money || v instanceof ReportBook.Pct) {
                    // ALIGN_RIGHT is the line's end edge: right in English, left in an RTL (Arabic) cell.
                    c.setHorizontalAlignment(Element.ALIGN_RIGHT);
                }
                if (n % 2 == 1) {
                    c.setBackgroundColor(ZEBRA);
                }
                table.addCell(c);
            }
            n++;
        }
        if (t.rows().isEmpty()) {
            PdfPCell c = cell("—", new Font(r, 9, Font.NORMAL, MUTED), dir);
            c.setColspan(cols);
            table.addCell(c);
        }
        return table;
    }

    private static PdfPCell cell(String text, Font f, int dir) {
        PdfPCell c = new PdfPCell(new Phrase(text, f));
        c.setRunDirection(dir);
        c.setPadding(4);
        c.setBorder(Rectangle.BOTTOM);
        c.setBorderColor(RULE);
        return c;
    }

    private static PdfPTable block(String text, Font f, int dir, float after) {
        PdfPTable t = new PdfPTable(1);
        t.setWidthPercentage(100);
        t.setRunDirection(dir);
        t.setSpacingAfter(after);
        PdfPCell c = new PdfPCell(new Phrase(text == null ? "" : text, f));
        c.setRunDirection(dir);
        c.setBorder(Rectangle.NO_BORDER);
        c.setPadding(0);
        t.addCell(c);
        return t;
    }

    static String text(Object v) {
        if (v == null) {
            return "";
        }
        if (v instanceof ReportBook.Money m) {
            DecimalFormat fmt = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.ENGLISH));
            return LRE + fmt.format(BigDecimal.valueOf(m.halalas(), 2)) + PDF_MARK;
        }
        if (v instanceof ReportBook.Pct p) {
            DecimalFormat fmt = new DecimalFormat("0.0", DecimalFormatSymbols.getInstance(Locale.ENGLISH));
            return LRE + fmt.format(p.fraction() * 100) + "%" + PDF_MARK;
        }
        if (v instanceof Number n) {
            DecimalFormat fmt = new DecimalFormat("#,##0", DecimalFormatSymbols.getInstance(Locale.ENGLISH));
            return LRE + fmt.format(n.longValue()) + PDF_MARK;
        }
        return v.toString();
    }

    private static final class Footer extends PdfPageEventHelper {
        private final BaseFont font;
        private final String title;
        private final boolean rtl;

        Footer(BaseFont font, String title, boolean rtl) {
            this.font = font;
            this.title = title;
            this.rtl = rtl;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            PdfContentByte cb = writer.getDirectContent();
            Font f = new Font(font, 8, Font.NORMAL, MUTED);
            float y = document.bottom() - 18;
            int dir = rtl ? PdfWriter.RUN_DIRECTION_RTL : PdfWriter.RUN_DIRECTION_LTR;
            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT, new Phrase(LRE + "FieldOps · " + writer.getPageNumber() + PDF_MARK, f),
                    document.left(), y, 0, PdfWriter.RUN_DIRECTION_LTR, 0);
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT, new Phrase(title, f), document.right(), y, 0, dir, 0);
        }
    }

    private static byte[] resource(String path) {
        try (InputStream in = ReportPdfRenderer.class.getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("Missing font " + path);
            }
            return in.readAllBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
