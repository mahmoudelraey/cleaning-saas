package com.fieldops.app.auth;

import java.util.Locale;

import com.fieldops.app.common.util.PhoneNumbers;
import com.fieldops.app.common.web.ApiException;
import org.springframework.stereotype.Component;

/** Rules for staff accounts shared by signup (admin AuthService) and user management (UserService). */
@Component
public class AccountRules {

    private final UserRepository users;

    public AccountRules(UserRepository users) {
        this.users = users;
    }

    public void assertIdentifiersFree(String phone, String email) {
        if (users.existsByPhone(phone)) {
            throw ApiException.conflict("phone_taken", "This phone number is already registered");
        }
        if (email != null && users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("email_taken", "This email is already registered");
        }
    }

    /** At least 8 characters with a letter and a digit (the same rule the UI shows). */
    public static void assertStrongPassword(String password) {
        if (password == null || password.length() < 8 || password.length() > 100
                || !password.chars().anyMatch(Character::isLetter) || !password.chars().anyMatch(Character::isDigit)) {
            throw ApiException.badRequest("weak_password", "Use at least 8 characters including letters and numbers");
        }
    }

    public static String normalizePhone(String raw) {
        return PhoneNumbers.normalizeSaudiMobile(raw)
                .orElseThrow(() -> ApiException.badRequest("invalid_phone", "Invalid Saudi mobile number"));
    }

    public static String normalizeEmail(String email) {
        return email == null || email.isBlank() ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
