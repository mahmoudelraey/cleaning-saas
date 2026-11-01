package com.fieldops.app.billing.pdf;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DocumentPdfRendererTest {

    private final DocumentPdfRenderer renderer = new DocumentPdfRenderer();

    private static PdfModel model(String qr, String stamp, byte[] logo) {
        return new PdfModel("فاتورة ضريبية مبسطة", "Simplified Tax Invoice", "INV-7",
                List.of(new PdfModel.Field("تاريخ الإصدار / Issue date", DocumentPdfRenderer.ltr("2026-10-22 10:30"))),
                new PdfModel.Party("البائع", "لمعة للتنظيف", List.of(new PdfModel.Field("VAT", "310122393500003"))),
                new PdfModel.Party("العميل", "نورة", List.of()),
                List.of(new PdfModel.Line("تنظيف شقة", "1", "300.00", "300.00")),
                List.of(new PdfModel.Field("المجموع", "300.00")),
                new PdfModel.Field("الإجمالي", "345.00"), qr, "ملاحظة", stamp, logo, "لمعة");
    }

    @Test
    void rendersArabicPdfWithEmbeddedFont() {
        byte[] pdf = renderer.render(model("AQZ0ZXN0", "ملغاة|VOID", null));
        String raw = new String(pdf, StandardCharsets.ISO_8859_1);
        assertThat(raw).startsWith("%PDF-");
        assertThat(raw).contains("IBMPlexSansArabic"); // subset font is embedded
    }

    @Test
    void brokenLogoNeverBreaksTheInvoice() {
        byte[] pdf = renderer.render(model(null, null, new byte[] {1, 2, 3, 4}));
        assertThat(new String(pdf, 0, 5, StandardCharsets.ISO_8859_1)).isEqualTo("%PDF-");
    }
}
