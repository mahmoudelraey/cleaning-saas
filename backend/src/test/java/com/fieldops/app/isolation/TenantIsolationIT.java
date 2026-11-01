package com.fieldops.app.isolation;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The most important test class in the project (plan section 5.3): a user of company A must not be able
 * to read or modify any record of company B through any endpoint. Add a case here for every new endpoint.
 */
class TenantIsolationIT extends IntegrationTest {

    private Session a;
    private Session b;
    private String customerA;
    private String addressA;
    private String serviceA;
    private String addonA;
    private String technicianA;

    @BeforeEach
    void seedCompanyA() throws Exception {
        a = signupCompany("alpha");
        b = signupCompany("beta");

        JsonNode customer = readJson(postAs(a, "/api/v1/customers",
                Map.of("name", "عميل أ", "phone", uniquePhone())).andExpect(status().isCreated()));
        customerA = customer.get("id").asText();

        addressA = readJson(postAs(a, "/api/v1/customers/" + customerA + "/addresses",
                Map.of("label", "المنزل", "city", "الرياض")).andExpect(status().isCreated())).get("id").asText();

        JsonNode service = readJson(postAs(a, "/api/v1/services", Map.of(
                "name", "تنظيف شقة", "pricingType", "FIXED", "basePriceHalalas", 25000, "durationMin", 180))
                .andExpect(status().isCreated()));
        serviceA = service.get("id").asText();

        addonA = readJson(postAs(a, "/api/v1/services/" + serviceA + "/addons",
                Map.of("name", "تنظيف ثلاجة", "priceHalalas", 5000)).andExpect(status().isCreated()))
                .get("id").asText();

        technicianA = readJson(postAs(a, "/api/v1/technicians", Map.of(
                "name", "فني أ", "phone", uniquePhone(), "password", "Tech#123456",
                "skills", List.of("تكييف"),
                "workHours", List.of(Map.of("day", "SUNDAY", "start", "08:00", "end", "17:00"))))
                .andExpect(status().isCreated())).get("id").asText();
    }

    @Test
    void ownerOfACanSeeOwnData() throws Exception {
        getAs(a, "/api/v1/customers/" + customerA).andExpect(status().isOk())
                .andExpect(jsonPath("$.addresses[0].id").value(addressA));
        getAs(a, "/api/v1/services/" + serviceA).andExpect(status().isOk());
        getAs(a, "/api/v1/technicians/" + technicianA).andExpect(status().isOk());
    }

    @Test
    void customersAreIsolated() throws Exception {
        String url = "/api/v1/customers/" + customerA;
        getAs(b, url).andExpect(status().isNotFound());
        putAs(b, url, Map.of("name", "hacked", "phone", uniquePhone())).andExpect(status().isNotFound());
        deleteAs(b, url).andExpect(status().isNotFound());
        postAs(b, url + "/addresses", Map.of("label", "x")).andExpect(status().isNotFound());
        putAs(b, url + "/addresses/" + addressA, Map.of("label", "x")).andExpect(status().isNotFound());
        deleteAs(b, url + "/addresses/" + addressA).andExpect(status().isNotFound());

        JsonNode listB = readJson(getAs(b, "/api/v1/customers").andExpect(status().isOk()));
        assertThat(listB.get("total").asLong()).isZero();

        // A's data is untouched.
        getAs(a, url).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("عميل أ"));
    }

    @Test
    void customerPhoneUniquenessIsPerCompany() throws Exception {
        String phone = readJson(getAs(a, "/api/v1/customers/" + customerA)).get("phone").asText();
        // Same end customer can be a customer of two different companies.
        postAs(b, "/api/v1/customers", Map.of("name", "نفس العميل", "phone", phone)).andExpect(status().isCreated());
    }

    @Test
    void servicesAreIsolated() throws Exception {
        String url = "/api/v1/services/" + serviceA;
        getAs(b, url).andExpect(status().isNotFound());
        putAs(b, url, Map.of("name", "x", "pricingType", "FIXED", "basePriceHalalas", 1, "durationMin", 30))
                .andExpect(status().isNotFound());
        deleteAs(b, url).andExpect(status().isNotFound());
        postAs(b, url + "/addons", Map.of("name", "x", "priceHalalas", 1)).andExpect(status().isNotFound());
        putAs(b, url + "/addons/" + addonA, Map.of("name", "x", "priceHalalas", 1)).andExpect(status().isNotFound());
        deleteAs(b, url + "/addons/" + addonA).andExpect(status().isNotFound());

        JsonNode listB = readJson(getAs(b, "/api/v1/services").andExpect(status().isOk()));
        assertThat(listB.size()).isZero();
    }

    @Test
    void techniciansAreIsolated() throws Exception {
        String url = "/api/v1/technicians/" + technicianA;
        getAs(b, url).andExpect(status().isNotFound());
        putAs(b, url, Map.of("name", "x", "active", true)).andExpect(status().isNotFound());

        JsonNode listB = readJson(getAs(b, "/api/v1/technicians").andExpect(status().isOk()));
        assertThat(listB.size()).isZero();
    }

    @Test
    void usersAreIsolated() throws Exception {
        String url = "/api/v1/users/" + a.userId();
        getAs(b, url).andExpect(status().isNotFound());
        putAs(b, url, Map.of("name", "x", "role", "COORDINATOR", "active", false)).andExpect(status().isNotFound());
        postAs(b, url + "/password", Map.of("password", "NewPass#123")).andExpect(status().isNotFound());

        JsonNode listB = readJson(getAs(b, "/api/v1/users").andExpect(status().isOk()));
        assertThat(listB.size()).isEqualTo(1);
        assertThat(listB.get(0).get("id").asText()).isEqualTo(b.userId().toString());
    }

    @Test
    void bookingsAreIsolated() throws Exception {
        String start = java.time.Instant.now().plus(java.time.Duration.ofDays(3)).toString();
        String bookingA = readJson(postAs(a, "/api/v1/bookings", Map.of("customerId", customerA,
                "scheduledStart", start, "items", List.of(Map.of("serviceId", serviceA)))))
                .get("id").asText();
        String url = "/api/v1/bookings/" + bookingA;

        getAs(b, url).andExpect(status().isNotFound());
        putAs(b, url, Map.of("customerId", customerA, "scheduledStart", start,
                "items", List.of(Map.of("serviceId", serviceA)))).andExpect(status().isNotFound());
        postAs(b, url + "/assign", Map.of("technicianIds", List.of(technicianA))).andExpect(status().isNotFound());
        postAs(b, url + "/notes", Map.of("note", "x")).andExpect(status().isNotFound());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(url + "/status")
                        .header("Authorization", "Bearer " + b.accessToken())
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("status", "CANCELLED"))))
                .andExpect(status().isNotFound());
        assertThat(readJson(getAs(b, "/api/v1/bookings")).get("total").asLong()).isZero();

        // B cannot reference A's customer, service or technician from its own bookings.
        postAs(b, "/api/v1/bookings", Map.of("customerId", customerA, "scheduledStart", start,
                "items", List.of(Map.of("serviceId", serviceA)))).andExpect(status().isNotFound());
        String customerB = readJson(postAs(b, "/api/v1/customers", Map.of("name", "عميل ب", "phone", uniquePhone())))
                .get("id").asText();
        postAs(b, "/api/v1/bookings", Map.of("customerId", customerB, "scheduledStart", start,
                "items", List.of(Map.of("serviceId", serviceA)))).andExpect(status().isNotFound());
        String serviceB = readJson(postAs(b, "/api/v1/services", Map.of("name", "خدمة ب", "pricingType", "FIXED",
                "basePriceHalalas", 100, "durationMin", 60))).get("id").asText();
        String bookingB = readJson(postAs(b, "/api/v1/bookings", Map.of("customerId", customerB,
                "scheduledStart", start, "items", List.of(Map.of("serviceId", serviceB))))).get("id").asText();
        postAs(b, "/api/v1/bookings/" + bookingB + "/assign", Map.of("technicianIds", List.of(technicianA)))
                .andExpect(status().isNotFound());

        // Calendars only show own company.
        String to = java.time.Instant.now().plus(java.time.Duration.ofDays(7)).toString();
        JsonNode calB = readJson(getAs(b, "/api/v1/scheduling/calendar?from=" + java.time.Instant.now() + "&to=" + to));
        assertThat(calB.get("bookings").size()).isEqualTo(1);
        assertThat(calB.get("technicians").size()).isZero();
    }

    @Test
    void tenantSettingsAreOwnCompanyOnly() throws Exception {
        getAs(b, "/api/v1/tenant").andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(b.tenantId().toString()));
    }
}
