package com.fieldops.app.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import com.fieldops.app.common.security.JwtService;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantRepository;
import com.fieldops.app.tenant.TenantService;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final TenantRepository tenants;
    private final TenantService tenantService;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokens;
    private final Clock clock;
    /** Compared against when the user does not exist, so response time does not reveal valid accounts. */
    private final String dummyHash;

    public AuthService(UserRepository users, TenantRepository tenants, TenantService tenantService,
                       PasswordEncoder passwordEncoder, JwtService jwtService,
                       RefreshTokenService refreshTokens, Clock clock) {
        this.users = users;
        this.tenants = tenants;
        this.tenantService = tenantService;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTokens = refreshTokens;
        this.clock = clock;
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    public record Tokens(String accessToken, String refreshToken, long expiresIn, UserView user) {
    }

    public record UserView(UUID id, UUID tenantId, String name, String phone, String email, Role role,
                           boolean mustChangePassword) {
        static UserView of(User u) {
            return new UserView(u.getId(), u.getTenantId(), u.getName(), u.getPhone(), u.getEmail(), u.getRole(),
                    u.isMustChangePassword());
        }
    }

    /** Self-serve signup: creates the company (14-day trial) and its owner account, then signs in. */
    @Transactional
    public Tokens signup(String companyName, String slug, String ownerName, String rawPhone, String email,
                         String password) {
        String phone = normalizePhone(rawPhone);
        String normalizedEmail = normalizeEmail(email);
        assertIdentifiersFree(phone, normalizedEmail);

        Tenant tenant = tenantService.createTrialTenant(companyName, slug);
        User owner = users.save(new User(tenant.getId(), ownerName.trim(), phone, normalizedEmail,
                passwordEncoder.encode(password), Role.OWNER));
        owner.markLoggedIn(Instant.now(clock));
        return issueTokens(owner);
    }

    /** Login with phone number or email. */
    @Transactional
    public Tokens login(String identifier, String password) {
        Optional<User> found = findByIdentifier(identifier);
        if (found.isEmpty()) {
            passwordEncoder.matches(password, dummyHash);
            throw new BadCredentialsException("bad credentials");
        }
        User user = found.get();
        if (!passwordEncoder.matches(password, user.getPasswordHash()) || !user.isActive()) {
            throw new BadCredentialsException("bad credentials");
        }
        assertTenantUsable(user.getTenantId());
        user.markLoggedIn(Instant.now(clock));
        return issueTokens(user);
    }

    /** Not transactional on purpose: rotation must commit its theft-revocation even when it throws. */
    public Tokens refresh(String rawRefreshToken) {
        // Check the subscription BEFORE rotating, so a blocked company keeps its session for when it is reactivated.
        refreshTokens.activeOwner(rawRefreshToken)
                .flatMap(users::findById)
                .ifPresent(u -> assertTenantUsable(u.getTenantId()));
        RefreshTokenService.RotationResult rotated = refreshTokens.rotate(rawRefreshToken);
        User user = users.findById(rotated.userId())
                .filter(User::isActive)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "invalid_refresh_token",
                        "Session expired, please sign in again"));
        assertTenantUsable(user.getTenantId());
        String access = jwtService.issueAccessToken(user.getId(), user.getTenantId(), user.getRole(), user.getName(),
                user.isMustChangePassword());
        return new Tokens(access, rotated.newRawToken(), jwtService.accessTtlSeconds(), UserView.of(user));
    }

    /**
     * The signed-in user replaces their password (required after an owner set a temporary one). All other
     * sessions are signed out; this device gets fresh tokens without the password-change flag.
     */
    @Transactional
    public Tokens changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = users.findByIdAndTenantId(userId, TenantContext.require())
                .filter(User::isActive)
                .orElseThrow(() -> ApiException.notFound("user"));
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw ApiException.badRequest("wrong_password", "Current password is incorrect");
        }
        assertStrongPassword(newPassword);
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw ApiException.badRequest("password_reused", "Choose a password different from the current one");
        }
        user.changeOwnPassword(passwordEncoder.encode(newPassword), Instant.now(clock));
        refreshTokens.revokeAll(user.getId());
        return issueTokens(user);
    }

    /** At least 8 characters with a letter and a digit (the same rule the UI shows). */
    static void assertStrongPassword(String password) {
        if (password == null || password.length() < 8 || password.length() > 100
                || !password.chars().anyMatch(Character::isLetter) || !password.chars().anyMatch(Character::isDigit)) {
            throw ApiException.badRequest("weak_password", "Use at least 8 characters including letters and numbers");
        }
    }

    public void logout(String rawRefreshToken) {
        refreshTokens.revoke(rawRefreshToken);
    }

    @Transactional(readOnly = true)
    public UserView me(UUID userId) {
        return users.findByIdAndTenantId(userId, TenantContext.require())
                .map(UserView::of)
                .orElseThrow(() -> ApiException.notFound("user"));
    }

    // ---------------------------------------------------------------------------------------------

    private Tokens issueTokens(User user) {
        String access = jwtService.issueAccessToken(user.getId(), user.getTenantId(), user.getRole(), user.getName(),
                user.isMustChangePassword());
        String refresh = refreshTokens.issue(user.getId()).rawToken();
        return new Tokens(access, refresh, jwtService.accessTtlSeconds(), UserView.of(user));
    }

    private Optional<User> findByIdentifier(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return Optional.empty();
        }
        String id = identifier.trim();
        if (id.contains("@")) {
            return users.findByEmailIgnoreCase(id);
        }
        return PhoneNumbers.normalizeSaudiMobile(id).flatMap(users::findByPhone);
    }

    private void assertTenantUsable(UUID tenantId) {
        Tenant tenant = tenants.findById(tenantId).orElseThrow(() -> new BadCredentialsException("bad credentials"));
        if (!tenant.isUsable(Instant.now(clock))) {
            // Allowed to authenticate later for billing; for now block with a clear code the UI can explain.
            throw ApiException.forbidden("subscription_inactive", "Your subscription is not active");
        }
    }

    void assertIdentifiersFree(String phone, String email) {
        if (users.existsByPhone(phone)) {
            throw ApiException.conflict("phone_taken", "This phone number is already registered");
        }
        if (email != null && users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("email_taken", "This email is already registered");
        }
    }

    static String normalizePhone(String raw) {
        return PhoneNumbers.normalizeSaudiMobile(raw)
                .orElseThrow(() -> ApiException.badRequest("invalid_phone", "Invalid Saudi mobile number"));
    }

    static String normalizeEmail(String email) {
        return email == null || email.isBlank() ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
