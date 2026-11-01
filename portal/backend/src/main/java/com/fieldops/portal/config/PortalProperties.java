package com.fieldops.portal.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "portal")
public record PortalProperties(String adminPublicUrl, Security security, RateLimit rateLimit) {

    public record Security(Jwt jwt, List<String> corsOrigins) {
    }

    public record Jwt(String secret, String issuer, Duration accessTtl) {
    }

    public record RateLimit(int authPerMinute) {
    }
}
