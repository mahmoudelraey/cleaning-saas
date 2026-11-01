package com.fieldops.app.billing;

import static com.fieldops.app.billing.BillingService.money;
import static com.fieldops.app.billing.pdf.DocumentPdfRenderer.ltr;

import java.math.BigDecimal;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import com.fieldops.app.billing.pdf.DocumentPdfRenderer;
import com.fieldops.app.billing.pdf.PdfModel;
import com.fieldops.app.billing.pdf.PdfModel.Field;
import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantLogoService;
import com.fieldops.app.tenant.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Turns invoices and quotes into PDFs (Arabic first, English second, Latin digits). */
@Service
public class BillingPdfService {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final BillingService billing;
    private final TenantService tenants;
    private final TenantLogoService logos;
    private final DocumentPdfRenderer renderer = new DocumentPdfRenderer();

    public BillingPdfService(BillingService billing, TenantService tenants, TenantLogoService logos) {
        this.billing = billing;
        this.tenants = tenants;
        this.logos = logos;
    }

    @Transactional(readOnly = true)
    public byte[] invoicePdf(java.util.UUID id) {
        Invoice inv = billing.getInvoice(id);
        Tenant t = tenants.current();
        ZoneId zone = ZoneId.of(t.getTimezone());

        String titleAr;
        String titleEn;
        if (!inv.isVatInvoice()) {
            titleAr = "فاتورة";
            titleEn = "Invoice";
        } else if (inv.getCustomerVatNumber() != null) {
            titleAr = "فاتورة ضريبية";
            titleEn = "Tax Invoice";
        } else {
            titleAr = "فاتورة ضريبية مبسطة";
            titleEn = "Simplified Tax Invoice";
        }

        List<Field> meta = new ArrayList<>();
        meta.add(new Field("تاريخ الإصدار / Issue date", ltr(DATE_TIME.format(inv.getIssuedAt().atZone(zone)))));
        if (inv.getDueDate() != null) {
            meta.add(new Field("تاريخ الاستحقاق / Due date", ltr(DATE.format(inv.getDueDate()))));
        }

        List<Field> customer = new ArrayList<>();
        customer.add(new Field("الجوال / Mobile", ltr(PhoneNumbers.display(inv.getCustomerPhone()))));
        if (inv.getCustomerVatNumber() != null) {
            customer.add(new Field("الرقم الضريبي / VAT No.", ltr(inv.getCustomerVatNumber())));
        }

        List<Field> totals = totals(inv.getLinesTotalHalalas(), inv.getDiscountHalalas(), inv.getTaxableHalalas(),
                inv.getVatHalalas(), inv.getVatRateBp(), inv.isVatInvoice());
        if (inv.getPaidHalalas() > 0 && inv.getStatus() != Invoice.Status.VOID) {
            totals.add(new Field("المدفوع / Paid", money(inv.getPaidHalalas())));
            totals.add(new Field("المتبقي / Balance due", money(inv.balanceHalalas())));
        }

        String stamp = switch (inv.getStatus()) {
            case VOID -> "ملغاة|VOID";
            case PAID -> "مدفوعة|PAID";
            default -> null;
        };
        String notes = inv.getNotes();
        if (inv.getStatus() == Invoice.Status.VOID && inv.getVoidReason() != null) {
            notes = "سبب الإلغاء / Void reason: " + inv.getVoidReason() + (notes == null ? "" : "\n" + notes);
        }

        PdfModel model = new PdfModel(titleAr, titleEn, "INV-" + inv.getNumber(), meta,
                seller(inv.getSellerName(), inv.getSellerVatNumber(), inv.getSellerCr(), inv.getSellerAddress(), t),
                new PdfModel.Party("العميل / Bill to", inv.getCustomerName(), customer),
                lines(inv.getLines()), totals,
                new Field("الإجمالي / Total (SAR)", money(inv.getTotalHalalas())),
                inv.zatcaQr(), notes, stamp, logo(t), footer(t));
        return renderer.render(model);
    }

    @Transactional(readOnly = true)
    public byte[] quotePdf(java.util.UUID id) {
        Quote q = billing.getQuote(id);
        Tenant t = tenants.current();
        ZoneId zone = ZoneId.of(t.getTimezone());
        boolean vat = q.getVatRateBp() > 0;

        List<Field> meta = List.of(
                new Field("التاريخ / Date", ltr(DATE.format(q.getCreatedAt().atZone(zone)))),
                new Field("صالح حتى / Valid until", ltr(DATE.format(q.getValidUntil()))));
        List<Field> customer = List.of(new Field("الجوال / Mobile", ltr(PhoneNumbers.display(q.getCustomerPhone()))));
        String stamp = switch (q.getStatus()) {
            case ACCEPTED -> "مقبول|ACCEPTED";
            case REJECTED -> "مرفوض|REJECTED";
            default -> null;
        };
        PdfModel model = new PdfModel("عرض سعر", "Quotation", "Q-" + q.getNumber(), meta,
                seller(t.getName(), t.getVatNumber(), t.getCommercialRegistration(), t.getAddress(), t),
                new PdfModel.Party("مقدم إلى / Prepared for", q.getCustomerName(), customer),
                lines(q.getLines()),
                totals(q.getLinesTotalHalalas(), q.getDiscountHalalas(), q.getTaxableHalalas(), q.getVatHalalas(),
                        q.getVatRateBp(), vat),
                new Field("الإجمالي / Total (SAR)", money(q.getTotalHalalas())),
                null, q.getNotes(), stamp, logo(t), footer(t));
        return renderer.render(model);
    }

    private static PdfModel.Party seller(String name, String vat, String cr, String address, Tenant t) {
        List<Field> d = new ArrayList<>();
        if (vat != null) {
            d.add(new Field("الرقم الضريبي / VAT No.", ltr(vat)));
        }
        if (cr != null) {
            d.add(new Field("السجل التجاري / CR", ltr(cr)));
        }
        if (address != null) {
            d.add(new Field("العنوان / Address", address));
        }
        if (t.getPhone() != null) {
            d.add(new Field("الهاتف / Phone", ltr(PhoneNumbers.display(t.getPhone()))));
        }
        return new PdfModel.Party("البائع / Seller", name, d);
    }

    private static List<PdfModel.Line> lines(List<DocumentLine> lines) {
        return lines.stream().map(l -> new PdfModel.Line(l.getDescription(), quantity(l.getQuantity()),
                money(l.getUnitPriceHalalas()), money(l.getTotalHalalas()))).toList();
    }

    private static List<Field> totals(long lines, long discount, long taxable, long vat, int rateBp, boolean vatInvoice) {
        List<Field> out = new ArrayList<>();
        out.add(new Field("المجموع / Subtotal", money(lines)));
        if (discount > 0) {
            out.add(new Field("الخصم / Discount", "-" + money(discount)));
        }
        if (vatInvoice) {
            String pct = BigDecimal.valueOf(rateBp, 2).stripTrailingZeros().toPlainString();
            out.add(new Field("الإجمالي الخاضع للضريبة / Taxable amount", money(taxable)));
            out.add(new Field("ضريبة القيمة المضافة / VAT " + ltr(pct + "%"), money(vat)));
        }
        return out;
    }

    private static String quantity(BigDecimal q) {
        return q.stripTrailingZeros().toPlainString();
    }

    private byte[] logo(Tenant t) {
        return logos.load(t).map(TenantLogoService.Logo::bytes).orElse(null);
    }

    private static String footer(Tenant t) {
        return t.getName() + (t.getPhone() != null ? " · " + ltr(PhoneNumbers.display(t.getPhone())) : "");
    }
}
