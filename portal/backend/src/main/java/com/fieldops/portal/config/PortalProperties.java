package com.fieldops.portal.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record PortalProperties(Db db, Admin admin, Security security, RateLimit rateLimit) {

    public record Db(String rlsRole) {
    }

    public record Admin(String baseUrl, String internalToken, String publicUrl) {
    }

    public record Security(Jwt jwt, List<String> corsOrigins) {
    }

    public record Jwt(String secret, String issuer, Duration accessTtl) {
    }

    public record RateLimit(int authPerMinute) {
    }
}
