package com.fieldops.app.platform;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Encrypts the secrets kept in {@code platform_settings} (WhatsApp token, app secret, SMS AppSid) with AES-256-GCM,
 * so a database dump alone does not reveal them. Stored as {@code v1:<base64(iv | ciphertext+tag)>}.
 *
 * <p>The key is {@code SETTINGS_ENCRYPTION_KEY} (base64 of 32 random bytes). The dev default only works on
 * localhost ({@link com.fieldops.app.common.DevDefaultsGuard}). Changing the key makes saved secrets unreadable:
 * enter them again in Platform → Messaging.
 */
@Component
public class SettingsCipher {

    /** Development-only key shipped in application.yml. */
    public static final String DEV_KEY = "ZGV2LW9ubHktc2V0dGluZ3Mta2V5LWNoYW5nZS1tZSE=";

    private static final String PREFIX = "v1:";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public SettingsCipher(@Value("${app.settings.encryption-key:" + DEV_KEY + "}") String base64Key) {
        byte[] raw = Base64.getDecoder().decode(base64Key.trim());
        if (raw.length != 32) {
            throw new IllegalStateException("SETTINGS_ENCRYPTION_KEY must be base64 of exactly 32 bytes");
        }
        this.key = new SecretKeySpec(raw, "AES");
    }

    public String encrypt(String plain) {
        if (plain == null || plain.isEmpty()) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] enc = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + enc.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(enc, 0, out, iv.length, enc.length);
            return PREFIX + Base64.getEncoder().encodeToString(out);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not encrypt a setting", e);
        }
    }

    /** @return the secret, or null when empty or unreadable (e.g. after the key changed) */
    public String decrypt(String stored) {
        if (stored == null || stored.isEmpty() || !stored.startsWith(PREFIX)) {
            return null;
        }
        try {
            byte[] all = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, all, 0, IV_BYTES));
            return new String(c.doFinal(all, IV_BYTES, all.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return null;
        }
    }
}
