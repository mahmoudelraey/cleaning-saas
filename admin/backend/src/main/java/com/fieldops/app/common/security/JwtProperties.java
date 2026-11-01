package com.fieldops.app.common.security;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.security.jwt")
public record JwtProperties(String secret, String issuer, Duration accessTtl, Duration refreshTtl) {
}
