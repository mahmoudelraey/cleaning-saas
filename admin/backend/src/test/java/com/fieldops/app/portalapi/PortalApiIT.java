package com.fieldops.app.portalapi;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The internal API the customer portal backend calls (shared secret, one company, one customer). */
class PortalApiIT extends IntegrationTest {

    private static final ZoneId RIYADH = ZoneId.of("Asia/Riyadh");
    private static final String TOKEN = "test-internal-token";

    private Session owner;
    private String base;
    private String serviceId;

    @BeforeEach
    void seed() throws Exception {
        owner = signupCompany("portal");
        base = "/internal/portal/" + readJson(getAs(owner, "/api/v1/tenant")).get("slug").asText();
        serviceId = readJson(postAs(owner, "/api/v1/services", Map.of("name", "تنظيف فيلا", "pricingType", "FIXED",
                "basePriceHalalas", 40000, "durationMin", 120)).andExpect(status().isCreated())).get("id").asText();
        List<Map<String, String>> everyDay = java.util.stream.Stream.of("SATURDAY", "SUNDAY", "MONDAY", "TUESDAY",
                "WEDNESDAY", "THURSDAY", "FRIDAY").map(d -> Map.of("day", d, "start", "08:00", "end", "18:00")).toList();
        postAs(owner, "/api/v1/technicians", Map.of("name", "فني", "phone", uniquePhone(), "password", "Tech#123456",
                "workHours", everyDay)).andExpect(status().isCreated());
    }

    private ResultActions internal(String path, Object body) throws Exception {
        return mvc.perform(post(base + path).header(InternalTokenFilter.HEADER, TOKEN)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    @Test
    void refusesCallsWithoutTheSharedSecret() throws Exception {
        mvc.perform(get(base)).andExpect(status().isUnauthorized());
        mvc.perform(get(base).header(InternalTokenFilter.HEADER, "wrong")).andExpect(status().isUnauthorized());
        mvc.perform(get(base).header(InternalTokenFilter.HEADER, TOKEN)).andExpect(status().isOk())
                .andExpect(jsonPath("$.bookingOpen").value(true))
                .andExpect(jsonPath("$.cancelNoticeHours").value(6));
    }

    @Test
    void newCustomerSignsInRegistersBooksAndCancels() throws Exception {
        String phone = uniquePhone();
        String code = readJson(internal("/otp", Map.of("phone", phone)).andExpect(status().isOk())).get("devCode").asText();
        JsonNode who = readJson(internal("/otp/verify", Map.of("phone", phone, "code", code)).andExpect(status().isOk()));
        assertThat(who.has("customerId")).isFalse(); // first visit

        String customerId = readJson(internal("/customers", Map.of("phone", phone, "name", "هند القحطاني"))
                .andExpect(status().isCreated())).get("id").asText();

        LocalDate day = LocalDate.now(RIYADH).plusDays(4);
        JsonNode slots = readJson(internal("/availability", Map.of("date", day.toString(),
                "items", List.of(Map.of("serviceId", serviceId)))).andExpect(status().isOk()));
        String start = slots.get(0).get("start").asText();

        JsonNode booked = readJson(internal("/customers/" + customerId + "/bookings", Map.of(
                "items", List.of(Map.of("serviceId", serviceId)), "scheduledStart", start,
                "address", Map.of("city", "الرياض", "district", "النرجس"), "paymentMethod", "CASH"))
                .andExpect(status().isCreated()));
        assertThat(booked.get("status").asText()).isEqualTo("NEW");
        String bookingId = booked.get("id").asText();

        // The office sees where it came from.
        getAs(owner, "/api/v1/bookings/" + bookingId)
                .andExpect(jsonPath("$.source").value("PORTAL"))
                .andExpect(jsonPath("$.paymentMethod").value("CASH"))
                .andExpect(jsonPath("$.events[0].note").value("portal"));

        // Someone else can't cancel it; the owner can.
        internal("/customers/00000000-0000-0000-0000-000000000001/bookings/" + bookingId + "/cancel", Map.of())
                .andExpect(status().isNotFound());
        internal("/customers/" + customerId + "/bookings/" + bookingId + "/cancel", Map.of("reason", "سفر"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        getAs(owner, "/api/v1/bookings/" + bookingId)
                .andExpect(jsonPath("$.cancelReason").value("سفر"))
                .andExpect(jsonPath("$.events[?(@.toStatus=='CANCELLED')].actorName").value("هند القحطاني"));
    }
}
