package com.fieldops.app.booking;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BookingIT extends IntegrationTest {

    private static final ZoneId RIYADH = ZoneId.of("Asia/Riyadh");

    private Session owner;
    private String customerId;
    private String fixedService;
    private String hourlyService;
    private String addonId;
    private String techA;
    private String techB;
    private String techAPhone;
    private LocalDate sunday;

    @BeforeEach
    void seed() throws Exception {
        owner = signupCompany("book");
        customerId = readJson(postAs(owner, "/api/v1/customers", Map.of("name", "نورة", "phone", uniquePhone()))
                .andExpect(status().isCreated())).get("id").asText();
        JsonNode fixed = readJson(postAs(owner, "/api/v1/services", Map.of("name", "تنظيف شقة", "pricingType", "FIXED",
                "basePriceHalalas", 30000, "durationMin", 120)).andExpect(status().isCreated()));
        fixedService = fixed.get("id").asText();
        addonId = readJson(postAs(owner, "/api/v1/services/" + fixedService + "/addons",
                Map.of("name", "ثلاجة", "priceHalalas", 5000)).andExpect(status().isCreated())).get("id").asText();
        hourlyService = readJson(postAs(owner, "/api/v1/services", Map.of("name", "عاملة بالساعة",
                "pricingType", "HOURLY", "basePriceHalalas", 4500, "durationMin", 60))
                .andExpect(status().isCreated())).get("id").asText();

        List<Map<String, String>> sunToThu = List.of(
                Map.of("day", "SUNDAY", "start", "08:00", "end", "17:00"),
                Map.of("day", "MONDAY", "start", "08:00", "end", "17:00"));
        techAPhone = uniquePhone();
        techA = readJson(postAs(owner, "/api/v1/technicians", Map.of("name", "فني أ", "phone", techAPhone,
                "password", "Tech#123456", "workHours", sunToThu)).andExpect(status().isCreated())).get("id").asText();
        techB = readJson(postAs(owner, "/api/v1/technicians", Map.of("name", "فني ب", "phone", uniquePhone(),
                "password", "Tech#123456", "workHours", sunToThu)).andExpect(status().isCreated())).get("id").asText();
        sunday = LocalDate.now(RIYADH).with(TemporalAdjusters.next(DayOfWeek.SUNDAY));
    }

    private Instant at(int hour, int minute) {
        return sunday.atTime(hour, minute).atZone(RIYADH).toInstant();
    }

    private JsonNode createBooking(Instant start, List<String> technicians) throws Exception {
        return readJson(postAs(owner, "/api/v1/bookings", Map.of(
                "customerId", customerId,
                "scheduledStart", start.toString(),
                "items", List.of(Map.of("serviceId", fixedService, "addonIds", List.of(addonId))),
                "technicianIds", technicians))
                .andExpect(status().isCreated()));
    }

    @Test
    void pricesComeFromCatalogAndManualBookingsStartConfirmed() throws Exception {
        JsonNode b = createBooking(at(9, 0), List.of());
        assertThat(b.get("status").asText()).isEqualTo("CONFIRMED");
        assertThat(b.get("subtotalHalalas").asLong()).isEqualTo(35000); // 300 + 50 add-on
        assertThat(b.get("items").size()).isEqualTo(2);
        assertThat(Instant.parse(b.get("scheduledEnd").asText())).isEqualTo(at(11, 0)); // 120 min
        assertThat(b.get("number").asLong()).isEqualTo(1);
        assertThat(createBooking(at(13, 0), List.of()).get("number").asLong()).isEqualTo(2);
    }

    @Test
    void hourlyServiceNeedsHoursAndUsesThemForDuration() throws Exception {
        postAs(owner, "/api/v1/bookings/price-preview", Map.of("items", List.of(Map.of("serviceId", hourlyService))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("quantity_required"));
        postAs(owner, "/api/v1/bookings/price-preview",
                Map.of("items", List.of(Map.of("serviceId", hourlyService, "quantity", 3))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subtotalHalalas").value(13500))
                .andExpect(jsonPath("$.durationMin").value(180));
    }

    @Test
    void technicianCannotBeDoubleBooked() throws Exception {
        createBooking(at(9, 0), List.of(techA));
        JsonNode overlapping = createBooking(at(10, 0), List.of());
        postAs(owner, "/api/v1/bookings/" + overlapping.get("id").asText() + "/assign",
                Map.of("technicianIds", List.of(techA)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("technician_busy"));
        // Another technician is fine; back-to-back for the same one too.
        postAs(owner, "/api/v1/bookings/" + overlapping.get("id").asText() + "/assign",
                Map.of("technicianIds", List.of(techB))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ASSIGNED"));
        createBooking(at(11, 0), List.of(techA));
    }

    @Test
    void workHoursAreEnforcedUnlessForced() throws Exception {
        JsonNode evening = createBooking(at(18, 0), List.of());
        String url = "/api/v1/bookings/" + evening.get("id").asText() + "/assign";
        postAs(owner, url, Map.of("technicianIds", List.of(techA)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("outside_work_hours"));
        postAs(owner, url, Map.of("technicianIds", List.of(techA), "force", true)).andExpect(status().isOk());
    }

    @Test
    void cancellingReleasesTheTechnician() throws Exception {
        JsonNode first = createBooking(at(9, 0), List.of(techA));
        patchStatus(first.get("id").asText(), "CANCELLED").andExpect(status().isOk())
                .andExpect(jsonPath("$.technicians.length()").value(0));
        createBooking(at(9, 0), List.of(techA)); // same slot is free again
    }

    @Test
    void stateMachineRejectsIllegalTransitions() throws Exception {
        String id = createBooking(at(9, 0), List.of()).get("id").asText();
        patchStatus(id, "COMPLETED").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("invalid_transition"));
        // ASSIGNED is only reachable through /assign (which checks availability).
        patchStatus(id, "ASSIGNED").andExpect(status().isConflict());
        patchStatus(id, "CANCELLED").andExpect(status().isOk());
        patchStatus(id, "CONFIRMED").andExpect(status().isConflict()); // terminal
    }

    @Test
    void technicianDrivesOnlyFieldStepsOnOwnVisits() throws Exception {
        String mine = createBooking(at(9, 0), List.of(techA)).get("id").asText();
        String notMine = createBooking(at(9, 0), List.of(techB)).get("id").asText();
        Session tech = login(techAPhone, "Tech#123456");

        getAs(tech, "/api/v1/bookings/" + notMine).andExpect(status().isNotFound());
        getAs(tech, "/api/v1/bookings/" + mine).andExpect(status().isOk())
                .andExpect(jsonPath("$.allowedTransitions[0]").value("ON_THE_WAY"));
        getAs(tech, "/api/v1/bookings").andExpect(status().isForbidden());

        mvcPatch(tech, mine, "CANCELLED").andExpect(status().isConflict()); // office-only step
        mvcPatch(tech, mine, "ON_THE_WAY").andExpect(status().isOk());
        mvcPatch(tech, mine, "IN_PROGRESS").andExpect(status().isOk());
        mvcPatch(tech, mine, "COMPLETED").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));
        mvcPatch(tech, notMine, "ON_THE_WAY").andExpect(status().isNotFound());
    }

    @Test
    void availabilityAccountsForAssignedAndUnassignedBookings() throws Exception {
        JsonNode before = readJson(getAs(owner, "/api/v1/scheduling/availability?date=" + sunday + "&durationMin=120"));
        JsonNode nine = slotAt(before, at(9, 0));
        assertThat(nine.get("capacity").asInt()).isEqualTo(2);

        createBooking(at(9, 0), List.of(techA)); // one technician busy
        createBooking(at(9, 0), List.of());       // one booking still needs a technician
        JsonNode after = readJson(getAs(owner, "/api/v1/scheduling/availability?date=" + sunday + "&durationMin=120"));
        assertThat(slotAt(after, at(9, 0))).isNull();
        assertThat(slotAt(after, at(15, 0)).get("capacity").asInt()).isEqualTo(2);
        assertThat(slotAt(after, at(16, 0))).isNull(); // would end after the 17:00 shift end
    }

    @Test
    void calendarListsTechniciansAndBookings() throws Exception {
        createBooking(at(9, 0), List.of(techA));
        getAs(owner, "/api/v1/scheduling/calendar?from=" + at(0, 0) + "&to=" + sunday.plusDays(1).atStartOfDay(RIYADH).toInstant())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.technicians.length()").value(2))
                .andExpect(jsonPath("$.bookings.length()").value(1))
                .andExpect(jsonPath("$.bookings[0].technicianIds[0]").value(techA));
    }

    private JsonNode slotAt(JsonNode slots, Instant start) {
        for (JsonNode s : slots) {
            if (Instant.parse(s.get("start").asText()).equals(start)) {
                return s;
            }
        }
        return null;
    }

    private org.springframework.test.web.servlet.ResultActions patchStatus(String id, String status) throws Exception {
        return mvcPatch(owner, id, status);
    }

    private org.springframework.test.web.servlet.ResultActions mvcPatch(Session s, String id, String status) throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .patch("/api/v1/bookings/" + id + "/status")
                .header("Authorization", "Bearer " + s.accessToken())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("status", status))));
    }
}
