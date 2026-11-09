package com.fieldops.app.common;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * There is one configuration per app (no Spring profiles): {@code application.yml} defaults are set for running
 * on a developer machine, including dev-only JWT keys and verification codes returned by the API.
 *
 * <p>This guard stops the app from starting with any of those dev defaults when {@code app.public-base-url}
 * points anywhere other than localhost, i.e. in any real environment. Production must set
 * {@code JWT_SECRET} (admin), {@code PORTAL_JWT_SECRET} (portal) and {@code OTP_EXPOSE_CODE=false}.
 */
@Component
public class DevDefaultsGuard {

    /** The dev keys shipped in application.yml of admin and portal. Never valid outside localhost. */
    static final Set<String> DEV_JWT_SECRETS = Set.of(
            "ZGV2LW9ubHktc2VjcmV0LWNoYW5nZS1tZS1iZWZvcmUtcHJvZHVjdGlvbi0xMjM0NTY=",
            "cG9ydGFsLWRldi1vbmx5LXNlY3JldC1jaGFuZ2UtbWUtYmVmb3JlLXByb2R1Y3Rpb24=");

    public DevDefaultsGuard(Environment env) {
        String publicBaseUrl = env.getProperty("app.public-base-url", "");
        if (isLocalhost(publicBaseUrl)) {
            return;
        }
        List<String> problems = new ArrayList<>();
        if (DEV_JWT_SECRETS.contains(env.getProperty("app.security.jwt.secret", ""))) {
            problems.add("JWT_SECRET is the dev key");
        }
        if (DEV_JWT_SECRETS.contains(env.getProperty("portal.security.jwt.secret", ""))) {
            problems.add("PORTAL_JWT_SECRET is the dev key");
        }
        if (com.fieldops.app.platform.SettingsCipher.DEV_KEY.equals(
                env.getProperty("app.settings.encryption-key", com.fieldops.app.platform.SettingsCipher.DEV_KEY))) {
            problems.add("SETTINGS_ENCRYPTION_KEY is the dev key");
        }
        if (env.getProperty("app.otp.expose-code", Boolean.class, false)) {
            problems.add("OTP_EXPOSE_CODE is true (verification codes would be returned by the API)");
        }
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Refusing to start with development defaults while PUBLIC_BASE_URL is "
                    + publicBaseUrl + ": " + String.join("; ", problems)
                    + ". Set real secrets and OTP_EXPOSE_CODE=false for this environment.");
        }
    }

    static boolean isLocalhost(String url) {
        try {
            String host = URI.create(url.trim()).getHost();
            if (host == null) {
                return false;
            }
            host = host.toLowerCase();
            return host.equals("localhost") || host.endsWith(".localhost")
                    || host.equals("127.0.0.1") || host.equals("[::1]") || host.equals("::1");
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
