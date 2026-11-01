package com.fieldops.app.publicpage;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.notification.NotificationService;
import com.fieldops.app.notification.NotificationTemplate;
import com.fieldops.app.tenant.Tenant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phone verification for the public booking page. Must run as the page's tenant (RLS on otp_codes).
 *
 * <ul>
 *   <li>6-digit code, valid 5 minutes, 5 wrong attempts lock it; only a SHA-256 hash is stored.</li>
 *   <li>Per phone: one code per minute, at most 3 per 15 minutes. Per company: at most 200 per hour, so
 *       nobody can burn a company's SMS budget. The per-IP limit on /api/v1/public/** also applies.</li>
 *   <li>A correct code returns a random session token (30 minutes, one booking).</li>
 * </ul>
 */
@Service
public class OtpService {

    static final Duration CODE_TTL = Duration.ofMinutes(5);
    static final Duration SESSION_TTL = Duration.ofMinutes(30);
    static final Duration COOLDOWN = Duration.ofSeconds(60);
    static final Duration WINDOW = Duration.ofMinutes(15);
    static final int MAX_PER_WINDOW = 3;
    static final int MAX_ATTEMPTS = 5;
    static final int MAX_PER_TENANT_HOUR = 200;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final OtpCodeRepository codes;
    private final NotificationService notifications;
    private final Clock clock;
    private final boolean exposeCode;

    public OtpService(OtpCodeRepository codes, NotificationService notifications, Clock clock,
                      @Value("${app.otp.expose-code:false}") boolean exposeCode) {
        this.codes = codes;
        this.notifications = notifications;
        this.clock = clock;
        this.exposeCode = exposeCode;
        if (exposeCode) {
            org.slf4j.LoggerFactory.getLogger(OtpService.class)
                    .warn("app.otp.expose-code=true: verification codes are returned by the API. Development only!");
        }
    }

    /** @param devCode the code itself, only when {@code app.otp.expose-code=true} (local development). */
    public record Sent(Instant expiresAt, int resendAfterSeconds, String devCode) {
    }

    @Transactional
    public Sent send(Tenant tenant, String phone) {
        Instant now = Instant.now(clock);
        codes.findFirstByPhoneOrderByCreatedAtDesc(phone)
                .filter(last -> last.getCreatedAt().isAfter(now.minus(COOLDOWN)))
                .ifPresent(last -> {
                    throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "otp_cooldown",
                            "Wait a minute before requesting another code");
                });
        if (codes.countByPhoneAndCreatedAtAfter(phone, now.minus(WINDOW)) >= MAX_PER_WINDOW) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "otp_too_many",
                    "Too many codes requested. Try again in 15 minutes");
        }
        if (codes.countByCreatedAtAfter(now.minus(Duration.ofHours(1))) >= MAX_PER_TENANT_HOUR) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "otp_too_many", "Booking page is busy, try later");
        }

        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        codes.save(new OtpCode(phone, codeHash(phone, code), now.plus(CODE_TTL)));
        notifications.enqueue(null, NotificationTemplate.OTP, phone, List.of(code, tenant.getName()));
        return new Sent(now.plus(CODE_TTL), (int) COOLDOWN.toSeconds(), exposeCode ? code : null);
    }

    /** Checks the latest code for the phone. Wrong attempts are saved even though an error is thrown. */
    @Transactional(noRollbackFor = ApiException.class)
    public String verify(String phone, String code) {
        Instant now = Instant.now(clock);
        OtpCode otp = codes.findFirstByPhoneOrderByCreatedAtDesc(phone)
                .filter(o -> o.getVerifiedAt() == null)
                .orElseThrow(() -> ApiException.badRequest("otp_invalid", "Request a new code"));
        if (otp.getAttempts() >= MAX_ATTEMPTS) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "otp_locked", "Too many wrong codes. Request a new one");
        }
        if (now.isAfter(otp.getExpiresAt())) {
            throw ApiException.badRequest("otp_expired", "The code has expired. Request a new one");
        }
        String digits = code == null ? "" : code.trim();
        if (!MessageDigest.isEqual(otp.getCodeHash().getBytes(StandardCharsets.US_ASCII),
                codeHash(phone, digits).getBytes(StandardCharsets.US_ASCII))) {
            otp.failedAttempt();
            throw ApiException.badRequest("otp_invalid", "The code is incorrect");
        }
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        otp.verified(now, sha256(token), now.plus(SESSION_TTL));
        return token;
    }

    /** Marks the session used and returns the verified phone. Call inside the booking transaction. */
    @Transactional
    public String consume(String sessionToken) {
        Instant now = Instant.now(clock);
        if (sessionToken == null || sessionToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "otp_required", "Verify your phone first");
        }
        OtpCode otp = codes.findBySessionHash(sha256(sessionToken.trim()))
                .filter(o -> o.getUsedAt() == null && o.getSessionExpiresAt() != null && now.isBefore(o.getSessionExpiresAt()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "otp_required",
                        "Your verification expired. Verify your phone again"));
        otp.use(now);
        return otp.getPhone();
    }

    /** Peek without consuming (to prefill the form). */
    @Transactional(readOnly = true)
    public String phoneOf(String sessionToken) {
        Instant now = Instant.now(clock);
        return codes.findBySessionHash(sha256(sessionToken == null ? "" : sessionToken.trim()))
                .filter(o -> o.getUsedAt() == null && o.getSessionExpiresAt() != null && now.isBefore(o.getSessionExpiresAt()))
                .map(OtpCode::getPhone)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "otp_required", "Verify your phone first"));
    }

    private static String codeHash(String phone, String code) {
        return sha256(TenantContext.require() + ":" + phone + ":" + code);
    }

    static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
