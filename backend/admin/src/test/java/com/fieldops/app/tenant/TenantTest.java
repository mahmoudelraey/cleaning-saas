package com.fieldops.app.tenant;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TenantTest {

    private final Instant now = Instant.parse("2026-10-22T10:00:00Z");

    @Test
    void trialIsUsableOnlyBeforeItsEnd() {
        assertThat(trialEndingAt(now.plus(Duration.ofMinutes(1))).isUsable(now)).isTrue();
        assertThat(trialEndingAt(now).isUsable(now)).isFalse();
        assertThat(trialEndingAt(now.minus(Duration.ofDays(1))).isUsable(now)).isFalse();
    }

    @Test
    void trialWithoutEndDateFailsClosed() {
        assertThat(trialEndingAt(null).isUsable(now)).isFalse();
    }

    private static Tenant trialEndingAt(Instant end) {
        return Tenant.startTrial("Co", "co-1", "pro", "Asia/Riyadh", end);
    }
}
