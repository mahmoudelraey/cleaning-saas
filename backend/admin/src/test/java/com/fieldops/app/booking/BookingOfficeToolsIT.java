package com.fieldops.app.booking;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Payment method, the assignment status event and office-written messages to the customer. */
class BookingOfficeToolsIT extends IntegrationTest {

    private static final ZoneId RIYADH = ZoneId.of("Asia/Riyadh");

    private Session owner;
    private String customerId;
    private String serviceId;
    private String techId;
    private Instant start;

    @BeforeEach
    void seed() throws Exception {
        owner = signupCompany("tools");
        customerId = readJson(postAs(owner, "/api/v1/customers", Map.of("name", "سارة العتيبي", "phone", uniquePhone()))
                .andExpect(status().isCreated())).get("id").asText();
        serviceId = readJson(postAs(owner, "/api/v1/services", Map.of("name", "تنظيف", "pricingType", "FIXED",
                "basePriceHalalas", 20000, "durationMin", 60)).andExpect(status().isCreated())).get("id").asText();
        techId = readJson(postAs(owner, "/api/v1/technicians", Map.of("name", "فني", "phone", uniquePhone(),
                "password", "Tech#123456", "workHours", List.of(Map.of("day", "SUNDAY", "start", "08:00", "end", "17:00")))))
                .get("id").asText();
        start = LocalDate.now(RIYADH).with(TemporalAdjusters.next(DayOfWeek.SUNDAY)).atTime(9, 0).atZone(RIYADH).toInstant();
    }

    private JsonNode create(String paymentMethod) throws Exception {
        Map<String, Object> body = new HashMap<>(Map.of(
                "customerId", customerId,
                "scheduledStart", start.toString(),
                "items", List.of(Map.of("serviceId", serviceId))));
        if (paymentMethod != null) {
            body.put("paymentMethod", paymentMethod);
        }
        return readJson(postAs(owner, "/api/v1/bookings", body).andExpect(status().isCreated()));
    }

    @Test
    void paymentMethodIsStoredShownAndOptional() throws Exception {
        JsonNode b = create("MADA");
        assertThat(b.get("paymentMethod").asText()).isEqualTo("MADA");
        getAs(owner, "/api/v1/bookings?size=5")
                .andExpect(jsonPath("$.items[0].paymentMethod").value("MADA"))
                .andExpect(jsonPath("$.items[0].services[0]").value("تنظيف")); // shown in the customer's history

        JsonNode none = create(null);
        assertThat(none.path("paymentMethod").isMissingNode()).isTrue(); // nulls are left out of responses

        postAs(owner, "/api/v1/bookings", Map.of("customerId", customerId, "scheduledStart", start.toString(),
                "items", List.of(Map.of("serviceId", serviceId)), "paymentMethod", "BITCOIN"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void assigningRecordsTheStatusChangeInTheTimeline() throws Exception {
        String id = create(null).get("id").asText();
        postAs(owner, "/api/v1/bookings/" + id + "/assign", Map.of("technicianIds", List.of(techId)))
                .andExpect(status().isOk());
        getAs(owner, "/api/v1/bookings/" + id)
                .andExpect(jsonPath("$.events[?(@.type=='STATUS_CHANGED' && @.fromStatus=='CONFIRMED' && @.toStatus=='ASSIGNED')]").exists())
                .andExpect(jsonPath("$.events[?(@.type=='ASSIGNED')]").exists());
    }

    @Test
    void officeCanWriteToTheCustomer() throws Exception {
        String id = create(null).get("id").asText();
        JsonNode sent = readJson(postAs(owner, "/api/v1/bookings/" + id + "/messages",
                Map.of("message", "  الفني سيصل\nبعد ربع ساعة  ")).andExpect(status().isCreated()));
        assertThat(sent.get("template").asText()).isEqualTo("CUSTOM_MESSAGE");
        // First name only, company name, and the text on one line (WhatsApp template params can't hold newlines).
        assertThat(sent.get("body").asText()).startsWith("مرحباً سارة، رسالة من ").endsWith(": الفني سيصل بعد ربع ساعة");

        postAs(owner, "/api/v1/bookings/" + id + "/messages", Map.of("message", "   "))
                .andExpect(status().isBadRequest());
        postAs(owner, "/api/v1/bookings/" + id + "/messages", Map.of("message", "x".repeat(501)))
                .andExpect(status().isBadRequest());
    }
}
