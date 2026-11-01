package com.fieldops.app.common;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClockConfig {

    /** Injected everywhere time matters (trials, token expiry, scheduling) so tests can control it. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
