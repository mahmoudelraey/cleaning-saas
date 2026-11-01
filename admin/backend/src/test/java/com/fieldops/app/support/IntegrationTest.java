package com.fieldops.app.support;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fieldops.app.common.ratelimit.RateLimitFilter;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Base for integration tests: real PostgreSQL 16 (Testcontainers), Flyway migrations, full security chain.
 * The container user is a superuser, so these tests also prove RLS works via SET LOCAL ROLE.
 */
@SpringBootTest(properties = {
        "app.security.jwt.secret=dGVzdC1vbmx5LXNlY3JldC10ZXN0LW9ubHktc2VjcmV0LTEyMzQ1Njc4OTA=",
        "app.rate-limit.public-per-minute=10000",
        "app.storage.local-dir=${java.io.tmpdir}/fieldops-test-uploads",
        "app.jobs.enabled=false",
        "app.notifications.whatsapp.app-secret=test-webhook-secret",
        "app.otp.expose-code=true",
        "app.portal.internal-token=test-internal-token"
})
@AutoConfigureMockMvc
public abstract class IntegrationTest {

    /**
     * One container for the whole test run (not per class), so Spring's cached context never points
     * at a stopped database. Ryuk removes it when the JVM exits.
     */
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
    }

    private static final AtomicInteger SEQ = new AtomicInteger(1000);

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate planJdbc;

    @Autowired
    private com.fieldops.app.tenant.PlanFeatureService planFeatures;

    /** Moves a company to another plan (what support does today when a customer upgrades). */
    protected void switchPlan(Session s, String planId) {
        planJdbc.update("update tenants set plan_id = ? where id = ?", planId, s.tenantId());
        planFeatures.evict(s.tenantId());
    }

    @BeforeEach
    void resetRateLimits() {
        rateLimitFilter.reset();
    }

    /** A signed-up company with its owner's tokens. */
    public record Session(UUID tenantId, UUID userId, String accessToken, String refreshToken, String phone) {
    }

    /** Unique Saudi mobile per call so tests never collide on the global unique index. */
    protected static String uniquePhone() {
        return "05" + String.format("%08d", SEQ.incrementAndGet());
    }

    protected Session signupCompany(String slugPrefix) throws Exception {
        String phone = uniquePhone();
        String slug = slugPrefix + "-" + SEQ.incrementAndGet();
        JsonNode body = readJson(mvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of(
                                "companyName", "شركة " + slug,
                                "slug", slug,
                                "ownerName", "Owner " + slug,
                                "phone", phone,
                                "password", "Secret#12345"))))
                .andExpect(status().isCreated()));
        return new Session(
                UUID.fromString(body.at("/user/tenantId").asText()),
                UUID.fromString(body.at("/user/id").asText()),
                body.get("accessToken").asText(),
                body.get("refreshToken").asText(),
                phone);
    }

    /**
     * Signs in. Accounts created by an owner start with a temporary password; like the real app, this
     * helper then replaces it (new password = old + "x9") so the session can use the API.
     */
    protected Session login(String identifier, String password) throws Exception {
        JsonNode body = readJson(mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", identifier, "password", password))))
                .andExpect(status().isOk()));
        if (body.at("/user/mustChangePassword").asBoolean(false)) {
            body = readJson(mvc.perform(post("/api/v1/auth/change-password")
                            .header("Authorization", "Bearer " + body.get("accessToken").asText())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("currentPassword", password,
                                    "newPassword", password + "x9"))))
                    .andExpect(status().isOk()));
        }
        return new Session(
                UUID.fromString(body.at("/user/tenantId").asText()),
                UUID.fromString(body.at("/user/id").asText()),
                body.get("accessToken").asText(),
                body.get("refreshToken").asText(),
                identifier);
    }

    protected ResultActions getAs(Session s, String url) throws Exception {
        return mvc.perform(auth(get(url), s));
    }

    protected ResultActions postAs(Session s, String url, Object body) throws Exception {
        return mvc.perform(auth(post(url), s).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    protected ResultActions putAs(Session s, String url, Object body) throws Exception {
        return mvc.perform(auth(put(url), s).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    protected ResultActions patchAs(Session s, String url, Object body) throws Exception {
        return mvc.perform(auth(patch(url), s).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    /** Anonymous JSON POST (public pages). */
    protected ResultActions postPublic(String url, Object body) throws Exception {
        return mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    protected ResultActions deleteAs(Session s, String url) throws Exception {
        return mvc.perform(auth(delete(url), s));
    }

    protected JsonNode readJson(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder b, Session s) {
        return b.header("Authorization", "Bearer " + s.accessToken());
    }
}
