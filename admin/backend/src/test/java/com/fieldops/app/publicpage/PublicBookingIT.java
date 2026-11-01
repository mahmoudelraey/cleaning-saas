package com.fieldops.app.publicpage;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PublicBookingIT extends IntegrationTest {

    private static final ZoneId RIYADH = ZoneId.of("Asia/Riyadh");

    private Session owner;
    private String slug;
    private String base;
    private String serviceId;
    private String addonId;

    @BeforeEach
    void seed() throws Exception {
        owner = signupCompany("page");
        slug = readJson(getAs(owner, "/api/v1/tenant")).get("slug").asText();
        base = "/api/v1/public/booking/" + slug;
        serviceId = readJson(postAs(owner, "/api/v1/services", Map.of("name", "تنظيف شقة", "pricingType", "FIXED",
                "basePriceHalalas", 30000, "durationMin", 120)).andExpect(status().isCreated())).get("id").asText();
        addonId = readJson(postAs(owner, "/api/v1/services/" + serviceId + "/addons",
                Map.of("name", "ثلاجة", "priceHalalas", 5000)).andExpect(status().isCreated())).get("id").asText();
        postAs(owner, "/api/v1/services", Map.of("name", "خدمة موقوفة", "pricingType", "FIXED", "basePriceHalalas", 100,
                "durationMin", 30, "active", false)).andExpect(status().isCreated());
        List<Map<String, String>> everyDay = java.util.stream.Stream.of("SATURDAY", "SUNDAY", "MONDAY", "TUESDAY",
                "WEDNESDAY", "THURSDAY", "FRIDAY").map(d -> Map.of("day", d, "start", "08:00", "end", "18:00")).toList();
        postAs(owner, "/api/v1/technicians", Map.of("name", "فني", "phone", uniquePhone(), "password", "Tech#123456",
                "workHours", everyDay)).andExpect(status().isCreated());
    }

    private List<Map<String, Object>> items() {
        return List.of(Map.of("serviceId", serviceId, "addonIds", List.of(addonId)));
    }

    private String firstSlot(LocalDate date) throws Exception {
        JsonNode slots = readJson(postPublic(base + "/availability", Map.of("date", date.toString(), "items", items()))
                .andExpect(status().isOk()));
        assertThat(slots.size()).isPositive();
        assertThat(slots.get(0).has("freeTechnicians")).isFalse(); // never leak who is free
        return slots.get(0).get("start").asText();
    }

    private String verifiedSession(String phone) throws Exception {
        String code = readJson(postPublic(base + "/otp", Map.of("phone", phone)).andExpect(status().isOk()))
                .get("devCode").asText();
        assertThat(code).hasSize(6);
        return readJson(postPublic(base + "/otp/verify", Map.of("phone", phone, "code", code))
                .andExpect(status().isOk())).get("sessionToken").asText();
    }

    private Map<String, Object> booking(String token, String start) {
        Map<String, Object> body = new HashMap<>();
        body.put("sessionToken", token);
        body.put("name", "ريم الشهري");
        body.put("items", items());
        body.put("scheduledStart", start);
        body.put("address", Map.of("city", "الرياض", "district", "الملقا", "details", "شارع 12، فيلا 4"));
        body.put("notes", "البوابة الخلفية");
        return body;
    }

    @Test
    void pageShowsOnlyActiveServicesAndUnknownSlugIs404() throws Exception {
        mvc.perform(get(base))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.services.length()").value(1))
                .andExpect(jsonPath("$.services[0].addons[0].priceHalalas").value(5000))
                .andExpect(jsonPath("$.leadTimeHours").value(2));
        mvc.perform(get("/api/v1/public/booking/no-such-company")).andExpect(status().isNotFound());

        postPublic(base + "/quote", Map.of("items", items()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subtotalHalalas").value(35000))
                .andExpect(jsonPath("$.durationMin").value(120));
    }

    @Test
    void verifiedCustomerBooksAnOpenSlotOnce() throws Exception {
        String phone = uniquePhone();
        String token = verifiedSession(phone);
        String start = firstSlot(LocalDate.now(RIYADH).plusDays(3));

        JsonNode booked = readJson(postPublic(base + "/bookings", booking(token, start)).andExpect(status().isCreated()));
        assertThat(booked.get("status").asText()).isEqualTo("NEW");
        assertThat(booked.get("subtotalHalalas").asLong()).isEqualTo(35000);

        // The session is single use.
        postPublic(base + "/bookings", booking(token, start))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("otp_required"));

        // The office sees it, from the booking page, with the new customer and address.
        JsonNode list = readJson(getAs(owner, "/api/v1/bookings?status=NEW"));
        assertThat(list.get("total").asLong()).isEqualTo(1);
        JsonNode b = list.get("items").get(0);
        assertThat(b.get("source").asText()).isEqualTo("PUBLIC_PAGE");
        assertThat(b.get("customerName").asText()).isEqualTo("ريم الشهري");
        assertThat(b.get("addressText").asText()).contains("الملقا");

        // A receipt message was queued for the customer.
        assertThat(readJson(getAs(owner, "/api/v1/notifications")).toString()).contains("BOOKING_RECEIVED");
    }

    @Test
    void wrongCodesAreCountedAndLockTheCode() throws Exception {
        String phone = uniquePhone();
        postPublic(base + "/otp", Map.of("phone", phone)).andExpect(status().isOk());
        for (int i = 0; i < 5; i++) {
            postPublic(base + "/otp/verify", Map.of("phone", phone, "code", "000000"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("otp_invalid"));
        }
        postPublic(base + "/otp/verify", Map.of("phone", phone, "code", "000000"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("otp_locked"));
    }

    @Test
    void codesAreThrottledPerPhone() throws Exception {
        String phone = uniquePhone();
        postPublic(base + "/otp", Map.of("phone", phone)).andExpect(status().isOk());
        postPublic(base + "/otp", Map.of("phone", phone))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("otp_cooldown"));
        postPublic(base + "/otp", Map.of("phone", "0112345678"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_phone"));
    }

    @Test
    void bookingOutsideOpenSlotsIsRejected() throws Exception {
        String token = verifiedSession(uniquePhone());
        // 03:00 Riyadh: nobody works.
        String night = LocalDate.now(RIYADH).plusDays(3).atTime(3, 0).atZone(RIYADH).toInstant().toString();
        postPublic(base + "/bookings", booking(token, night))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("slot_unavailable"));
    }

    @Test
    void ownerCanTurnThePageOff() throws Exception {
        putAs(owner, "/api/v1/tenant/booking-page", Map.of("enabled", false, "note", "مغلق مؤقتاً"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bookingPageEnabled").value(false));
        mvc.perform(get(base)).andExpect(status().isNotFound());
        postPublic(base + "/otp", Map.of("phone", uniquePhone())).andExpect(status().isNotFound());
    }

    @Test
    void otpRowsAreIsolatedPerCompany() throws Exception {
        // The same phone verified on company A cannot be used to book on company B.
        String phone = uniquePhone();
        String token = verifiedSession(phone);
        Session other = signupCompany("page-other");
        String otherSlug = readJson(getAs(other, "/api/v1/tenant")).get("slug").asText();
        String otherService = readJson(postAs(other, "/api/v1/services", Map.of("name", "x", "pricingType", "FIXED",
                "basePriceHalalas", 100, "durationMin", 60)).andExpect(status().isCreated())).get("id").asText();
        Map<String, Object> body = new HashMap<>();
        body.put("sessionToken", token);
        body.put("name", "x");
        body.put("items", List.of(Map.of("serviceId", otherService)));
        body.put("scheduledStart", LocalDate.now(RIYADH).plusDays(3).atTime(10, 0).atZone(RIYADH).toInstant().toString());
        postPublic("/api/v1/public/booking/" + otherSlug + "/bookings", body)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("otp_required"));
    }
}
