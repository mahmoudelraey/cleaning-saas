package com.fieldops.app.common.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class PhoneNumbersTest {

    @ParameterizedTest
    @ValueSource(strings = {"0551234567", "551234567", "966551234567", "+966551234567", "00966551234567",
            "055 123 4567", "055-123-4567", "٠٥٥١٢٣٤٥٦٧", "+966 55 123 4567"})
    void normalizesToE164(String raw) {
        assertThat(PhoneNumbers.normalizeSaudiMobile(raw)).contains("+966551234567");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "0112345678", "05512345", "05512345678", "+971551234567", "abc", "0451234567"})
    void rejectsNonSaudiMobile(String raw) {
        assertThat(PhoneNumbers.normalizeSaudiMobile(raw)).isEmpty();
    }

    @Test
    void displaysSaudiMobileGrouped() {
        assertThat(PhoneNumbers.display("+966551234567")).isEqualTo("+966 55 123 4567");
        assertThat(PhoneNumbers.display("+971551234567")).isEqualTo("+971551234567");
        assertThat(PhoneNumbers.display(null)).isEmpty();
    }
}
