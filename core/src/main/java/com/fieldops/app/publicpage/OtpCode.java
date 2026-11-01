package com.fieldops.app.publicpage;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** A one-time code sent to a phone; once verified it becomes a single-use booking session. */
@Entity
@Table(name = "otp_codes")
public class OtpCode extends TenantScopedEntity {

    @Column(nullable = false, updatable = false)
    private String phone;

    @Column(name = "code_hash", nullable = false, updatable = false)
    private String codeHash;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    @Column(name = "session_hash")
    private String sessionHash;

    @Column(name = "session_expires_at")
    private Instant sessionExpiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    protected OtpCode() {
    }

    public OtpCode(String phone, String codeHash, Instant expiresAt) {
        this.phone = phone;
        this.codeHash = codeHash;
        this.expiresAt = expiresAt;
    }

    public void failedAttempt() {
        attempts++;
    }

    public void verified(Instant at, String sessionHash, Instant sessionExpiresAt) {
        this.verifiedAt = at;
        this.sessionHash = sessionHash;
        this.sessionExpiresAt = sessionExpiresAt;
    }

    public void use(Instant at) {
        this.usedAt = at;
    }

    public String getPhone() {
        return phone;
    }

    public String getCodeHash() {
        return codeHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public Instant getVerifiedAt() {
        return verifiedAt;
    }

    public Instant getSessionExpiresAt() {
        return sessionExpiresAt;
    }

    public Instant getUsedAt() {
        return usedAt;
    }
}
