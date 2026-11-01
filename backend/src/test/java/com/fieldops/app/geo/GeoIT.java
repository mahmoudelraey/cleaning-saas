package com.fieldops.app.geo;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GeoIT extends IntegrationTest {

    private int cityId(JsonNode cities, String nameAr) {
        for (JsonNode c : cities) {
            if (c.get("nameAr").asText().equals(nameAr)) {
                return c.get("id").asInt();
            }
        }
        throw new AssertionError("city not found: " + nameAr);
    }

    @Test
    void lookupIsPublicCachedAndDistrictsFollowTheCity() throws Exception {
        mvc.perform(get("/api/v1/geo/regions")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(13));
        JsonNode cities = readJson(mvc.perform(get("/api/v1/geo/cities"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("max-age"))));
        assertThat(cities.size()).isGreaterThan(4000);
        assertThat(cities.get(0).get("nameAr").asText()).isEqualTo("الرياض"); // most districts first

        int riyadh = cityId(cities, "الرياض");
        int jeddah = cityId(cities, "جدة");
        JsonNode riyadhDistricts = readJson(mvc.perform(get("/api/v1/geo/cities/" + riyadh + "/districts")));
        JsonNode jeddahDistricts = readJson(mvc.perform(get("/api/v1/geo/cities/" + jeddah + "/districts")));
        assertThat(riyadhDistricts.size()).isGreaterThan(100);
        assertThat(jeddahDistricts.size()).isGreaterThan(100);

        Session owner = signupCompany("geo");
        String customer = readJson(postAs(owner, "/api/v1/customers", Map.of("name", "نورة", "phone", uniquePhone()))
                .andExpect(status().isCreated())).get("id").asText();

        Map<String, Object> wrong = new HashMap<>();
        wrong.put("label", "المنزل");
        wrong.put("cityId", riyadh);
        wrong.put("districtId", jeddahDistricts.get(0).get("id").asLong());
        postAs(owner, "/api/v1/customers/" + customer + "/addresses", wrong)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_district"));

        JsonNode district = riyadhDistricts.get(0);
        Map<String, Object> ok = new HashMap<>(wrong);
        ok.put("districtId", district.get("id").asLong());
        ok.put("city", "ignored when an id is given");
        JsonNode saved = readJson(postAs(owner, "/api/v1/customers/" + customer + "/addresses", ok)
                .andExpect(status().isCreated()));
        assertThat(saved.get("cityId").asInt()).isEqualTo(riyadh);
        assertThat(saved.get("city").asText()).isEqualTo("الرياض");
        assertThat(saved.get("district").asText()).isEqualTo(district.get("nameAr").asText());

        // Free-text addresses still work (no lookup ids).
        postAs(owner, "/api/v1/customers/" + customer + "/addresses", Map.of("label", "مكتب", "city", "مدينة صغيرة"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cityId").doesNotExist());
    }
}
