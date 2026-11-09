package com.fieldops.app.platform;

import com.fieldops.app.auth.AccountRules;
import com.fieldops.app.auth.User;
import com.fieldops.app.auth.UserRepository;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Creates the FieldOps owner's console account on startup from {@code PLATFORM_ADMIN_PHONE} /
 * {@code PLATFORM_ADMIN_PASSWORD} (optional {@code PLATFORM_ADMIN_NAME}, {@code PLATFORM_ADMIN_EMAIL}) when no
 * platform admin exists yet. Nothing happens once the account exists, so the variables can be removed afterwards
 * and the password changed in the app.
 */
@Component
public class PlatformAdminBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PlatformAdminBootstrap.class);

    private final UserRepository users;
    private final AccountRules rules;
    private final PasswordEncoder encoder;
    private final TransactionTemplate tx;
    private final String name;
    private final String phone;
    private final String email;
    private final String password;

    public PlatformAdminBootstrap(UserRepository users, AccountRules rules, PasswordEncoder encoder,
                                  TransactionTemplate tx,
                                  @Value("${app.platform.admin.name:FieldOps Admin}") String name,
                                  @Value("${app.platform.admin.phone:}") String phone,
                                  @Value("${app.platform.admin.email:}") String email,
                                  @Value("${app.platform.admin.password:}") String password) {
        this.users = users;
        this.rules = rules;
        this.encoder = encoder;
        this.tx = tx;
        this.name = name;
        this.phone = phone;
        this.email = email;
        this.password = password;
    }

    @Override
    public void run(ApplicationArguments args) {
        TenantContext.runAs(PlatformSettingsService.PLATFORM_TENANT_ID, () -> tx.executeWithoutResult(s -> {
            if (users.existsByRole(Role.PLATFORM_ADMIN)) {
                return;
            }
            if (phone.isBlank() || password.isBlank()) {
                log.warn("No platform admin account yet: set PLATFORM_ADMIN_PHONE and PLATFORM_ADMIN_PASSWORD "
                        + "and restart to create it.");
                return;
            }
            String normalizedPhone = AccountRules.normalizePhone(phone);
            String normalizedEmail = AccountRules.normalizeEmail(email.isBlank() ? null : email);
            rules.assertIdentifiersFree(normalizedPhone, normalizedEmail);
            AccountRules.assertStrongPassword(password);
            users.save(new User(PlatformSettingsService.PLATFORM_TENANT_ID, name.trim(), normalizedPhone,
                    normalizedEmail, encoder.encode(password), Role.PLATFORM_ADMIN));
            log.info("Created the platform admin account for {}", normalizedPhone);
        }));
    }
}
