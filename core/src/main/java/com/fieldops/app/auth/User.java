package com.fieldops.app.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.BaseEntity;
import com.fieldops.app.common.security.Role;

/**
 * Staff account. Intentionally NOT a {@code TenantScopedEntity}: login has to find the user before
 * any tenant is known. Every tenant-facing query goes through {@link UserRepository} methods that
 * take the tenant id explicitly, and those are covered by the isolation tests.
 */
@Entity
@Table(name = "users")
public class User extends BaseEntity {

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String phone;

    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    /** True while the user still has a temporary password set by an owner. */
    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

    @Column(name = "password_changed_at")
    private Instant passwordChangedAt;

    protected User() {
    }

    public User(UUID tenantId, String name, String phone, String email, String passwordHash, Role role) {
        this.tenantId = tenantId;
        this.name = name;
        this.phone = phone;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
    }

    public void update(String name, String email, Role role, boolean active) {
        this.name = name;
        this.email = email;
        this.role = role;
        this.active = active;
    }

    /** Password chosen by an owner (new account or reset): the user must replace it at next sign-in. */
    public void setTemporaryPassword(String passwordHash, Instant at) {
        this.passwordHash = passwordHash;
        this.mustChangePassword = true;
        this.passwordChangedAt = at;
    }

    /** Password chosen by the user. */
    public void changeOwnPassword(String passwordHash, Instant at) {
        this.passwordHash = passwordHash;
        this.mustChangePassword = false;
        this.passwordChangedAt = at;
    }

    public boolean isMustChangePassword() {
        return mustChangePassword;
    }

    public Instant getPasswordChangedAt() {
        return passwordChangedAt;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public void markLoggedIn(Instant at) {
        this.lastLoginAt = at;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getName() {
        return name;
    }

    public String getPhone() {
        return phone;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public Role getRole() {
        return role;
    }

    public boolean isActive() {
        return active;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }
}
