package com.fieldops.app.billing;

import java.time.Instant;

import com.fieldops.app.common.web.ApiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Expected values were computed independently (Python Decimal, half-up) to cross-check this code. */
class BillingMathTest {

    @Test
    void vatExclusivePrices() {
        var t = VatCalculator.compute(35000, 0, true, false);
        assertThat(t.taxable()).isEqualTo(35000);
        assertThat(t.vat()).isEqualTo(5250);
        assertThat(t.total()).isEqualTo(40250);
        assertThat(t.rateBp()).isEqualTo(1500);
    }

    @Test
    void vatInclusivePrices() {
        var t = VatCalculator.compute(35000, 0, true, true);
        assertThat(t.taxable()).isEqualTo(30435);
        assertThat(t.vat()).isEqualTo(4565);
        assertThat(t.total()).isEqualTo(35000);
        assertThat(VatCalculator.compute(1001, 0, true, true).vat()).isEqualTo(131);
    }

    @Test
    void discountAndRounding() {
        assertThat(VatCalculator.compute(35000, 1000, true, false).total()).isEqualTo(39100);
        assertThat(VatCalculator.compute(333, 0, true, false).vat()).isEqualTo(50); // 49.95 → 50
    }

    @Test
    void notRegisteredMeansNoVat() {
        var t = VatCalculator.compute(35000, 500, false, false);
        assertThat(t.vat()).isZero();
        assertThat(t.total()).isEqualTo(34500);
        assertThat(t.rateBp()).isZero();
    }

    @Test
    void discountCannotExceedTotal() {
        assertThatThrownBy(() -> VatCalculator.compute(100, 101, true, false)).isInstanceOf(ApiException.class);
    }

    @Test
    void zatcaTlvMatchesReferenceEncoding() {
        String qr = ZatcaQr.encode("لمعة للتنظيف", "310122393500003", Instant.parse("2026-10-22T07:30:00.123Z"), 40250, 5250);
        assertThat(qr).isEqualTo("ARfZhNmF2LnYqSDZhNmE2KrZhti42YrZgQIPMzEwMTIyMzkzNTAwMDAzAxQyMDI2LTEwLTIyVDA3OjMwOjAwWgQGNDAyLjUwBQU1Mi41MA==");
        assertThat(ZatcaQr.amount(5)).isEqualTo("0.05");
    }
}
