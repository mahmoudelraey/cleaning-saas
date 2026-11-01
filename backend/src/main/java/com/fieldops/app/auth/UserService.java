package com.fieldops.app.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Staff management inside the current company. Also used by the technician module to create logins. */
@Service
public class UserService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final AuthService authService;
    private final RefreshTokenService refreshTokens;
    private final Clock clock;

    public UserService(UserRepository users, PasswordEncoder passwordEncoder, AuthService authService,
                       RefreshTokenService refreshTokens, Clock clock) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.authService = authService;
        this.refreshTokens = refreshTokens;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<User> list() {
        return users.findByTenantIdOrderByNameAsc(TenantContext.require());
    }

    @Transactional(readOnly = true)
    public User get(UUID id) {
        return users.findByIdAndTenantId(id, TenantContext.require())
                .orElseThrow(() -> ApiException.notFound("user"));
    }

    @Transactional
    public User create(String name, String rawPhone, String email, String password, Role role) {
        String phone = AuthService.normalizePhone(rawPhone);
        String normalizedEmail = AuthService.normalizeEmail(email);
        authService.assertIdentifiersFree(phone, normalizedEmail);
        AuthService.assertStrongPassword(password);
        User user = new User(TenantContext.require(), name.trim(), phone, normalizedEmail,
                passwordEncoder.encode(password), role);
        // The owner chose this password, so the new user must replace it at first sign-in.
        user.setTemporaryPassword(user.getPasswordHash(), Instant.now(clock));
        return users.save(user);
    }

    @Transactional
    public User update(UUID id, String name, String email, Role role, boolean active) {
        User user = get(id);
        String normalizedEmail = AuthService.normalizeEmail(email);
        if (normalizedEmail != null && !normalizedEmail.equalsIgnoreCase(user.getEmail())
                && users.existsByEmailIgnoreCase(normalizedEmail)) {
            throw ApiException.conflict("email_taken", "This email is already registered");
        }
        if ((user.getRole() == Role.TECHNICIAN) != (role == Role.TECHNICIAN)) {
            // Technician accounts own a technician profile; converting them would orphan or miss it.
            throw ApiException.badRequest("role_change_not_allowed", "Cannot convert between technician and staff roles");
        }
        guardLastOwner(user, role, active);
        user.update(name.trim(), normalizedEmail, role, active);
        if (!active) {
            refreshTokens.revokeAll(user.getId());
        }
        return user;
    }

    @Transactional
    public void setActive(UUID id, boolean active) {
        User user = get(id);
        guardLastOwner(user, user.getRole(), active);
        user.setActive(active);
        if (!active) {
            refreshTokens.revokeAll(user.getId());
        }
    }

    /**
     * Owner sets a temporary password for a staff member or technician (forgotten password, new phone...).
     * Their sessions are signed out and they must choose their own password at next sign-in.
     */
    @Transactional
    public void resetPassword(UUID id, String newPassword) {
        User user = get(id);
        if (user.getId().equals(CurrentUser.idOrNull())) {
            throw ApiException.badRequest("cannot_reset_self", "Use \"Change password\" for your own account");
        }
        AuthService.assertStrongPassword(newPassword);
        user.setTemporaryPassword(passwordEncoder.encode(newPassword), Instant.now(clock));
        refreshTokens.revokeAll(user.getId());
    }

    /** A company must always keep at least one active owner, and owners cannot lock themselves out. */
    private void guardLastOwner(User user, Role newRole, boolean newActive) {
        boolean losingOwner = user.getRole() == Role.OWNER && user.isActive() && (newRole != Role.OWNER || !newActive);
        if (!losingOwner) {
            return;
        }
        if (user.getId().equals(CurrentUser.idOrNull())) {
            throw ApiException.badRequest("cannot_demote_self", "You cannot remove your own owner access");
        }
        if (users.countByTenantIdAndRoleAndActiveTrue(user.getTenantId(), Role.OWNER) <= 1) {
            throw ApiException.badRequest("last_owner", "The company must keep at least one active owner");
        }
    }
}
