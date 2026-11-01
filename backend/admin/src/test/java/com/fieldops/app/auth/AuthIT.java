package com.fieldops.app.auth;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthIT extends IntegrationTest {

    @Test
    void signupStartsTrialAndOwnerCanLoginWithLocalPhoneFormat() throws Exception {
        Session owner = signupCompany("auth");

        getAs(owner, "/api/v1/tenant").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("TRIAL"))
                .andExpect(jsonPath("$.plan.id").value("pro"));

        // Stored as +9665..., user types 05...
        Session again = login(owner.phone(), "Secret#12345");
        assertThat(again.userId()).isEqualTo(owner.userId());
    }

    @Test
    void wrongPasswordAndUnknownUserGiveSameError() throws Exception {
        Session owner = signupCompany("auth-bad");
        for (String identifier : List.of(owner.phone(), "0599999999")) {
            mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("identifier", identifier, "password", "nope-nope"))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("invalid_credentials"));
        }
    }

    @Test
    void duplicateSlugIsRejected() throws Exception {
        Session first = signupCompany("dup");
        String slug = readJson(getAs(first, "/api/v1/tenant")).get("slug").asText();
        mvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("companyName", "x", "slug", slug, "ownerName", "y",
                                "phone", uniquePhone(), "password", "Secret#12345"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("slug_taken"));
    }

    @Test
    void refreshTokenRotatesAndReuseRevokesAllSessions() throws Exception {
        Session owner = signupCompany("refresh");

        JsonNode first = refresh(owner.refreshToken(), 200);
        String rotated = first.get("refreshToken").asText();
        assertThat(rotated).isNotEqualTo(owner.refreshToken());

        // Re-using the old token = theft signal: rejected, and the rotated token dies too.
        refresh(owner.refreshToken(), 401);
        refresh(rotated, 401);
    }

    @Test
    void protectedEndpointsRequireToken() throws Exception {
        mvc.perform(get("/api/v1/customers")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/customers").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rolesAreEnforced() throws Exception {
        Session owner = signupCompany("roles");
        String techPhone = uniquePhone();
        postAs(owner, "/api/v1/technicians", Map.of("name", "فني", "phone", techPhone, "password", "Tech#123456"))
                .andExpect(status().isCreated());
        String coordPhone = uniquePhone();
        postAs(owner, "/api/v1/users", Map.of("name", "منسق", "phone", coordPhone, "password", "Coord#123456",
                "role", "COORDINATOR")).andExpect(status().isCreated());

        Session tech = login(techPhone, "Tech#123456");
        getAs(tech, "/api/v1/customers").andExpect(status().isForbidden());
        getAs(tech, "/api/v1/technicians/me").andExpect(status().isOk());
        getAs(tech, "/api/v1/services").andExpect(status().isOk());

        Session coord = login(coordPhone, "Coord#123456");
        getAs(coord, "/api/v1/customers").andExpect(status().isOk());
        postAs(coord, "/api/v1/services", Map.of("name", "x", "pricingType", "FIXED", "basePriceHalalas", 100,
                "durationMin", 60)).andExpect(status().isForbidden());
        getAs(coord, "/api/v1/users").andExpect(status().isForbidden());
    }

    @Test
    void ownerCannotRemoveOwnOwnerRole() throws Exception {
        Session owner = signupCompany("self");
        putAs(owner, "/api/v1/users/" + owner.userId(), Map.of("name", "x", "role", "COORDINATOR", "active", true))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("cannot_demote_self"));
    }

    @Test
    void deactivatedUserCannotLoginOrRefresh() throws Exception {
        Session owner = signupCompany("deact");
        String phone = uniquePhone();
        JsonNode coord = readJson(postAs(owner, "/api/v1/users", Map.of("name", "منسق", "phone", phone,
                "password", "Coord#123456", "role", "COORDINATOR")).andExpect(status().isCreated()));
        Session coordSession = login(phone, "Coord#123456");

        putAs(owner, "/api/v1/users/" + coord.get("id").asText(),
                Map.of("name", "منسق", "role", "COORDINATOR", "active", false)).andExpect(status().isOk());

        refresh(coordSession.refreshToken(), 401);
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", phone, "password", "Coord#123456"))))
                .andExpect(status().isUnauthorized());
    }

    private JsonNode refresh(String token, int expectedStatus) throws Exception {
        return readJson(mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("refreshToken", token))))
                .andExpect(status().is(expectedStatus)));
    }
}
