package com.fieldops.app.tenant;

import java.util.Map;

import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Each plan only opens the features listed in plans.features; the API refuses the rest. */
class PlanFeatureIT extends IntegrationTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R'};

    @Test
    void basicPlanCannotUseInvoicesReportsOrBranding() throws Exception {
        Session owner = signupCompany("basic");
        switchPlan(owner, "basic");

        getAs(owner, "/api/v1/invoices").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("feature_not_in_plan"));
        getAs(owner, "/api/v1/quotes").andExpect(status().isForbidden());
        getAs(owner, "/api/v1/reports/summary?from=2026-01-01&to=2026-01-31").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("feature_not_in_plan"));

        // Everything else keeps working.
        getAs(owner, "/api/v1/customers").andExpect(status().isOk());
        putAs(owner, "/api/v1/tenant/booking-page", Map.of("enabled", true)).andExpect(status().isOk());
    }

    @Test
    void proTrialHasInvoicesAndReportsButNoBranding() throws Exception {
        Session owner = signupCompany("protrial"); // signup = Pro trial
        getAs(owner, "/api/v1/invoices").andExpect(status().isOk());
        getAs(owner, "/api/v1/reports/summary?from=2026-01-01&to=2026-01-31").andExpect(status().isOk());

        mvc.perform(multipart("/api/v1/tenant/logo")
                        .file(new MockMultipartFile("file", "logo.png", "image/png", PNG))
                        .header("Authorization", "Bearer " + owner.accessToken()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("feature_not_in_plan"));
    }

    @Test
    void upgradingOpensTheFeatureRightAway() throws Exception {
        Session owner = signupCompany("upgrade");
        switchPlan(owner, "basic");
        getAs(owner, "/api/v1/invoices").andExpect(status().isForbidden());

        switchPlan(owner, "pro");
        getAs(owner, "/api/v1/invoices").andExpect(status().isOk());
    }
}
