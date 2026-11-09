package com.fieldops.app.platform;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public facts about the platform for the admin app: how to reach FieldOps to activate a plan (upgrade dialog,
 * "subscription inactive" page, before signing in) and the trial length shown on the signup page.
 */
@RestController
@RequestMapping("/api/v1/platform-info")
public class PlatformInfoController {

    private final PlatformSettingsService settings;

    public PlatformInfoController(PlatformSettingsService settings) {
        this.settings = settings;
    }

    @GetMapping
    public Info info() {
        PlatformSettingsService.Settings s = settings.get();
        return new Info(s.supportWhatsapp(), s.supportEmail(), s.trialDays());
    }

    public record Info(String supportWhatsapp, String supportEmail, int trialDays) {
    }
}
