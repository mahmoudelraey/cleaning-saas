package com.fieldops.app.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import com.fieldops.app.common.security.JwtProperties;
import com.fieldops.app.common.web.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Opaque refresh tokens with rotation. Presenting an already-rotated token is treated as theft:
 * every session of that user is revoked.
 */
@Service
public class RefreshTokenService implements UserSessions {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RefreshTokenRepository repo;
    private final JwtProperties props;
    private final Clock clock;

    public RefreshTokenService(RefreshTokenRepository repo, JwtProperties props, Clock clock) {
        this.repo = repo;
        this.props = props;
        this.clock = clock;
    }

    public record Issued(String rawToken, RefreshToken entity) {
    }

    @Transactional
    public Issued issue(UUID userId) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = Instant.now(clock);
        RefreshToken saved = repo.save(new RefreshToken(userId, hash(raw), now, now.plus(props.refreshTtl())));
        return new Issued(raw, saved);
    }

    /** Read-only lookup of the user behind a still-active token (no rotation, no side effects). */
    @Transactional(readOnly = true)
    public java.util.Optional<UUID> activeOwner(String rawToken) {
        Instant now = Instant.now(clock);
        return repo.findByTokenHash(hash(rawToken)).filter(t -> t.isActive(now)).map(RefreshToken::getUserId);
    }

    /** Validates and rotates. Returns the user id the new token belongs to. */
    @Transactional(noRollbackFor = ApiException.class)
    public RotationResult rotate(String rawToken) {
        Instant now = Instant.now(clock);
        RefreshToken current = repo.findByTokenHash(hash(rawToken)).orElseThrow(RefreshTokenService::invalid);

        if (current.getRevokedAt() != null) {
            log.warn("Refresh token reuse detected for user {}; revoking all sessions", current.getUserId());
            repo.revokeAllForUser(current.getUserId(), now);
            throw invalid();
        }
        if (!current.isActive(now)) {
            throw invalid();
        }
        Issued next = issue(current.getUserId());
        current.revoke(now, next.entity().getId());
        return new RotationResult(current.getUserId(), next.rawToken());
    }

    @Transactional
    public void revoke(String rawToken) {
        repo.findByTokenHash(hash(rawToken)).ifPresent(t -> t.revoke(Instant.now(clock), null));
    }

    @Transactional
    @Override
    public void revokeAll(UUID userId) {
        repo.revokeAllForUser(userId, Instant.now(clock));
    }

    public record RotationResult(UUID userId, String newRawToken) {
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "invalid_refresh_token", "Session expired, please sign in again");
    }

    static String hash(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
