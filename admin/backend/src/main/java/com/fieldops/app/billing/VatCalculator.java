package com.fieldops.app.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.fieldops.app.common.web.ApiException;

/**
 * Saudi VAT maths in integer halalas. One rounding step (half-up to the halala) on the document
 * total, never per line, so totals always reconcile.
 *
 * <ul>
 *   <li>Not VAT-registered (no VAT number): no VAT at all.</li>
 *   <li>Prices exclusive of VAT: VAT = round(taxable × rate); total = taxable + VAT.</li>
 *   <li>Prices inclusive of VAT: taxable = round(gross ÷ (1 + rate)); VAT = gross − taxable.</li>
 * </ul>
 */
public final class VatCalculator {

    /** 15% in basis points. */
    public static final int SAUDI_VAT_BP = 1500;

    private VatCalculator() {
    }

    public record Totals(long linesTotal, long discount, long taxable, long vat, long total, int rateBp) {
    }

    public static Totals compute(long linesTotal, long discount, boolean vatRegistered, boolean pricesIncludeVat) {
        if (discount < 0 || discount > linesTotal) {
            throw ApiException.badRequest("invalid_discount", "Discount must be between 0 and the lines total");
        }
        long afterDiscount = linesTotal - discount;
        if (!vatRegistered) {
            return new Totals(linesTotal, discount, afterDiscount, 0, afterDiscount, 0);
        }
        BigDecimal rate = BigDecimal.valueOf(SAUDI_VAT_BP, 4); // 0.1500
        if (pricesIncludeVat) {
            long taxable = BigDecimal.valueOf(afterDiscount)
                    .divide(BigDecimal.ONE.add(rate), 0, RoundingMode.HALF_UP).longValueExact();
            return new Totals(linesTotal, discount, taxable, afterDiscount - taxable, afterDiscount, SAUDI_VAT_BP);
        }
        long vat = BigDecimal.valueOf(afterDiscount).multiply(rate).setScale(0, RoundingMode.HALF_UP).longValueExact();
        return new Totals(linesTotal, discount, afterDiscount, vat, afterDiscount + vat, SAUDI_VAT_BP);
    }
}
