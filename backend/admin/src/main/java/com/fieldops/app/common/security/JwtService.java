package com.fieldops.app.common.security;

import java.time.Instant;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.fieldops.app.common.tenant.TenantContext;
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

/** Issues and verifies short-lived HS256 access tokens. Refresh tokens are opaque (see RefreshTokenService). */
@Component
public class JwtService {

    public static final String ROLE_CLAIM = CurrentUser.ROLE_CLAIM;
    public static final String NAME_CLAIM = CurrentUser.NAME_CLAIM;
    /** Present (true) only while the user must replace a temporary password; see PasswordChangeFilter. */
    public static final String PASSWORD_CHANGE_CLAIM = "pwd_change";
    /** Coordinators only: the admin screens they may open (Screen names). */
    public static final String SCREENS_CLAIM = CurrentUser.SCREENS_CLAIM;

    private final JwtProperties props;
    private final JwtEncoder encoder;
    private final JwtDecoder decoder;

    public JwtService(JwtProperties props) {
        this.props = props;
        SecretKey key = buildKey(props.secret());
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        NimbusJwtDecoder nimbusDecoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        nimbusDecoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(props.issuer()));
        this.decoder = nimbusDecoder;
    }

    public String issueAccessToken(UUID userId, UUID tenantId, Role role, String name, boolean mustChangePassword,
                                   Set<Screen> screens) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder builder = JwtClaimsSet.builder()
                .issuer(props.issuer())
                .subject(userId.toString())
                .issuedAt(now)
                .expiresAt(now.plus(props.accessTtl()))
                .id(UUID.randomUUID().toString())
                .claim(TenantContext.TENANT_CLAIM, tenantId.toString())
                .claim(ROLE_CLAIM, role.name())
                .claim(NAME_CLAIM, name);
        if (mustChangePassword) {
            builder.claim(PASSWORD_CHANGE_CLAIM, true);
        }
        if (role == Role.COORDINATOR) {
            builder.claim(SCREENS_CLAIM, screens.stream().map(Enum::name).sorted().toList());
        }
        JwtClaimsSet claims = builder.build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    public long accessTtlSeconds() {
        return props.accessTtl().toSeconds();
    }

    public JwtDecoder decoder() {
        return decoder;
    }

    private static SecretKey buildKey(String base64Secret) {
        if (base64Secret == null || base64Secret.isBlank()) {
            throw new IllegalStateException(
                    "app.security.jwt.secret is not set. Provide JWT_SECRET (base64, >= 32 bytes) "
                            + "or remove the empty override so the localhost dev key applies.");
        }
        byte[] bytes = Base64.getDecoder().decode(base64Secret);
        if (bytes.length < 32) {
            throw new IllegalStateException("app.security.jwt.secret must decode to at least 32 bytes");
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }
}
