package com.fieldops.app.auth;

import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PasswordChangeIT extends IntegrationTest {

    private JsonNode rawLogin(String phone, String password, int expected) throws Exception {
        return readJson(mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identifier", phone, "password", password))))
                .andExpect(status().is(expected)));
    }

    private Session session(JsonNode tokens, String phone) {
        return new Session(java.util.UUID.fromString(tokens.at("/user/tenantId").asText()),
                java.util.UUID.fromString(tokens.at("/user/id").asText()), tokens.get("accessToken").asText(),
                tokens.get("refreshToken").asText(), phone);
    }

    private String technician(Session owner, String phone) throws Exception {
        return readJson(postAs(owner, "/api/v1/technicians", Map.of("name", "فني", "phone", phone,
                "password", "Temp#12345")).andExpect(status().isCreated())).get("id").asText();
    }

    @Test
    void technicianMustReplaceTemporaryPasswordBeforeUsingTheApp() throws Exception {
        Session owner = signupCompany("pwd");
        assertThat(readJson(getAs(owner, "/api/v1/auth/me")).get("mustChangePassword").asBoolean()).isFalse();

        String phone = uniquePhone();
        String techId = technician(owner, phone);
        getAs(owner, "/api/v1/technicians/" + techId).andExpect(jsonPath("$.mustChangePassword").value(true));

        JsonNode first = rawLogin(phone, "Temp#12345", 200);
        assertThat(first.at("/user/mustChangePassword").asBoolean()).isTrue();
        Session temp = session(first, phone);

        // Everything except changing the password (and reading who I am) is blocked server-side.
        getAs(temp, "/api/v1/technicians/me/visits")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("password_change_required"));
        getAs(temp, "/api/v1/auth/me").andExpect(status().isOk());

        postAs(temp, "/api/v1/auth/change-password", Map.of("currentPassword", "wrong-1234", "newPassword", "Mine#56789"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("wrong_password"));
        postAs(temp, "/api/v1/auth/change-password", Map.of("currentPassword", "Temp#12345", "newPassword", "abcdefgh"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("weak_password"));
        postAs(temp, "/api/v1/auth/change-password", Map.of("currentPassword", "Temp#12345", "newPassword", "Temp#12345"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("password_reused"));

        JsonNode changed = readJson(postAs(temp, "/api/v1/auth/change-password",
                Map.of("currentPassword", "Temp#12345", "newPassword", "Mine#56789")).andExpect(status().isOk()));
        assertThat(changed.at("/user/mustChangePassword").asBoolean()).isFalse();
        Session ok = session(changed, phone);
        getAs(ok, "/api/v1/technicians/me/visits").andExpect(status().isOk());

        // The old refresh token (issued with the temporary password) no longer works.
        mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("refreshToken", temp.refreshToken()))))
                .andExpect(status().isUnauthorized());

        rawLogin(phone, "Temp#12345", 401);
        assertThat(rawLogin(phone, "Mine#56789", 200).at("/user/mustChangePassword").asBoolean()).isFalse();
        getAs(owner, "/api/v1/technicians/" + techId).andExpect(jsonPath("$.mustChangePassword").value(false));
    }

    @Test
    void ownerResetsTechnicianPasswordAndSignsThemOut() throws Exception {
        Session owner = signupCompany("pwd-reset");
        String phone = uniquePhone();
        String techId = technician(owner, phone);
        Session tech = login(phone, "Temp#12345"); // helper replaces the temporary password

        postAs(owner, "/api/v1/technicians/" + techId + "/password", Map.of("password", "Reset#2468"))
                .andExpect(status().isNoContent());

        mvc.perform(post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("refreshToken", tech.refreshToken()))))
                .andExpect(status().isUnauthorized());
        JsonNode again = rawLogin(phone, "Reset#2468", 200);
        assertThat(again.at("/user/mustChangePassword").asBoolean()).isTrue();

        // Only owners reset passwords, never their own through this path, and only inside their company.
        postAs(tech, "/api/v1/technicians/" + techId + "/password", Map.of("password", "Hack#1234"))
                .andExpect(status().isForbidden());
        postAs(owner, "/api/v1/users/" + owner.userId() + "/password", Map.of("password", "Self#12345"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("cannot_reset_self"));
        Session other = signupCompany("pwd-other");
        postAs(other, "/api/v1/technicians/" + techId + "/password", Map.of("password", "Hack#1234"))
                .andExpect(status().isNotFound());
    }

    @Test
    void anyUserCanChangeTheirOwnPassword() throws Exception {
        Session owner = signupCompany("pwd-own");
        postAs(owner, "/api/v1/auth/change-password", Map.of("currentPassword", "Secret#12345", "newPassword", "Better#2026"))
                .andExpect(status().isOk());
        rawLogin(owner.phone(), "Better#2026", 200);
    }
}
