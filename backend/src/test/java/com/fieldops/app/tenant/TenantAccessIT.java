package com.fieldops.app.tenant;

import java.util.Map;

import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Subscription enforcement is server-side only and applies to already signed-in users immediately. */
class TenantAccessIT extends IntegrationTest {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TenantAccessService access;

    @Test
    void expiredTrialBlocksExistingSessionImmediately() throws Exception {
        Session owner = signupCompany("expiry");
        getAs(owner, "/api/v1/customers").andExpect(status().isOk());

        // Trial ends (in the DB, the only source of truth) while the owner still holds a valid access token.
        jdbc.update("update tenants set trial_ends_at = now() - interval '1 minute' where id = ?", owner.tenantId());
        access.evict(owner.tenantId());

        getAs(owner, "/api/v1/customers")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("subscription_inactive"));
        postAs(owner, "/api/v1/customers", Map.of("name", "x", "phone", uniquePhone()))
                .andExpect(status().isForbidden());

        // Still allowed: read own status so the UI can explain.
        getAs(owner, "/api/v1/tenant").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("TRIAL"));

        // Refresh and new logins are refused too.
        mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("refreshToken", owner.refreshToken()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("subscription_inactive"));
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", owner.phone(), "password", "Secret#12345"))))
                .andExpect(status().isForbidden());

        // Blocked refresh did not burn the session: after reactivation the same refresh token still works.
        jdbc.update("update tenants set status = 'ACTIVE', trial_ends_at = null where id = ?", owner.tenantId());
        access.evict(owner.tenantId());
        mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("refreshToken", owner.refreshToken()))))
                .andExpect(status().isOk());
    }

    @Test
    void suspensionAndReactivationApplyAfterEviction() throws Exception {
        Session owner = signupCompany("suspend");

        jdbc.update("update tenants set status = 'SUSPENDED' where id = ?", owner.tenantId());
        access.evict(owner.tenantId());
        getAs(owner, "/api/v1/services").andExpect(status().isForbidden());

        jdbc.update("update tenants set status = 'ACTIVE', trial_ends_at = null where id = ?", owner.tenantId());
        access.evict(owner.tenantId());
        getAs(owner, "/api/v1/services").andExpect(status().isOk());
    }

    @Test
    void otherCompaniesAreUnaffected() throws Exception {
        Session expired = signupCompany("exp-a");
        Session healthy = signupCompany("exp-b");
        jdbc.update("update tenants set status = 'CANCELLED' where id = ?", expired.tenantId());
        access.evict(expired.tenantId());

        getAs(expired, "/api/v1/customers").andExpect(status().isForbidden());
        getAs(healthy, "/api/v1/customers").andExpect(status().isOk());
    }

    @Test
    void databaseRejectsTrialWithoutEndDate() throws Exception {
        Session owner = signupCompany("noend");
        assertThatThrownBy(() ->
                jdbc.update("update tenants set trial_ends_at = null where id = ?", owner.tenantId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
