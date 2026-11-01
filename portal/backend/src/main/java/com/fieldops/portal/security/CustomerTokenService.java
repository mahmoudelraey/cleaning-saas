package com.fieldops.portal.security;

import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.fieldops.portal.config.PortalProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;

/**
 * Customer access tokens (HS256, own key and issuer, so they are useless on the admin API).
 * Claims: {@code tid} company, {@code slug} company link, {@code cid} customer (absent until the
 * first-time visitor gives their name), {@code phone}, {@code name}.
 */
@Component
public class CustomerTokenService {

    public static final String TENANT = "tid";
    public static final String SLUG = "slug";
    public static final String CUSTOMER = "cid";
    public static final String PHONE = "phone";
    public static final String NAME = "name";

    private final PortalProperties.Jwt props;
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;

    public CustomerTokenService(PortalProperties props) {
        this.props = props.security().jwt();
        SecretKey key = key(this.props.secret());
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        NimbusJwtDecoder d = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        d.setJwtValidator(JwtValidators.createDefaultWithIssuer(this.props.issuer()));
        this.decoder = d;
    }

    public record Issued(String token, Instant expiresAt) {
    }

    public Issued issue(UUID tenantId, String slug, String phone, UUID customerId, String name) {
        Instant now = Instant.now();
        Instant exp = now.plus(props.accessTtl());
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(props.issuer())
                .subject(customerId != null ? customerId.toString() : "phone:" + phone)
                .issuedAt(now)
                .expiresAt(exp)
                .id(UUID.randomUUID().toString())
                .claim(TENANT, tenantId.toString())
                .claim(SLUG, slug)
                .claim(PHONE, phone);
        if (customerId != null) {
            claims.claim(CUSTOMER, customerId.toString());
        }
        if (name != null) {
            claims.claim(NAME, name);
        }
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims.build()))
                .getTokenValue();
        return new Issued(token, exp);
    }

    public JwtDecoder decoder() {
        return decoder;
    }

    private static SecretKey key(String base64) {
        if (base64 == null || base64.isBlank()) {
            throw new IllegalStateException("app.security.jwt.secret is not set (PORTAL_JWT_SECRET, base64, >= 32 bytes) "
                    + "or run with the 'local' profile for development.");
        }
        byte[] bytes = Base64.getDecoder().decode(base64);
        if (bytes.length < 32) {
            throw new IllegalStateException("app.security.jwt.secret must decode to at least 32 bytes");
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }
}
