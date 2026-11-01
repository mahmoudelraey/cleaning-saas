package com.fieldops.app.common.util;

import com.fieldops.app.tenant.Slugs;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class SlugsTest {

    @ParameterizedTest
    @ValueSource(strings = {"abc", "clean-co", "riyadh-ac-2", "a1b2c3"})
    void accepts(String slug) {
        assertThat(Slugs.isValid(slug)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"ab", "-abc", "abc-", "a--b", "ABC", "شركة", "has space", "admin", "www",
            "a234567890123456789012345678901234567890x"})
    void rejects(String slug) {
        assertThat(Slugs.isValid(slug)).isFalse();
    }
}
