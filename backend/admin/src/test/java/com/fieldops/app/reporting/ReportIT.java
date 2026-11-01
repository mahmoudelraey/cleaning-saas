package com.fieldops.app.reporting;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReportIT extends IntegrationTest {

    @org.springframework.beans.factory.annotation.Autowired
    private com.fieldops.app.billing.AutoInvoiceService autoInvoices;

    private static final ZoneId RIYADH = ZoneId.of("Asia/Riyadh");

    @Test
    void summaryAggregatesBookingsRevenueAndTechnicians() throws Exception {
        Session owner = signupCompany("rep");
        String customer = readJson(postAs(owner, "/api/v1/customers", Map.of("name", "نورة", "phone", uniquePhone()))
                .andExpect(status().isCreated())).get("id").asText();
        String service = readJson(postAs(owner, "/api/v1/services", Map.of("name", "تنظيف شقة", "pricingType", "FIXED",
                "basePriceHalalas", 30000, "durationMin", 120)).andExpect(status().isCreated())).get("id").asText();
        List<Map<String, String>> everyDay = java.util.stream.Stream.of("SATURDAY", "SUNDAY", "MONDAY", "TUESDAY",
                "WEDNESDAY", "THURSDAY", "FRIDAY").map(d -> Map.of("day", d, "start", "00:00", "end", "23:59")).toList();
        String tech = readJson(postAs(owner, "/api/v1/technicians", Map.of("name", "فني التقارير", "phone", uniquePhone(),
                "password", "Tech#123456", "workHours", everyDay)).andExpect(status().isCreated())).get("id").asText();

        LocalDate day = LocalDate.now(RIYADH).plusDays(1);
        String done = booking(owner, customer, service, day, 9);
        String cancelled = booking(owner, customer, service, day, 13);

        postAs(owner, "/api/v1/bookings/" + done + "/assign", Map.of("technicianIds", List.of(tech))).andExpect(status().isOk());
        for (String s : List.of("ON_THE_WAY", "IN_PROGRESS", "COMPLETED")) {
            patchAs(owner, "/api/v1/bookings/" + done + "/status", Map.of("status", s)).andExpect(status().isOk());
        }
        patchAs(owner, "/api/v1/bookings/" + cancelled + "/status", Map.of("status", "CANCELLED", "reason", "x"))
                .andExpect(status().isOk());

        // Completing the visit queued the automatic invoice; the scheduled job issues it.
        autoInvoices.processTenant(owner.tenantId());
        String invoice = readJson(getAs(owner, "/api/v1/bookings/" + done + "/invoices").andExpect(status().isOk()))
                .get(0).get("id").asText();
        postAs(owner, "/api/v1/invoices/" + invoice + "/payments", Map.of("method", "CASH", "amountHalalas", 10000))
                .andExpect(status().isCreated());

        String from = LocalDate.now(RIYADH).toString();
        String to = day.toString();
        JsonNode r = readJson(getAs(owner, "/api/v1/reports/summary?from=" + from + "&to=" + to).andExpect(status().isOk()));

        assertThat(r.at("/bookings/total").asLong()).isEqualTo(2);
        assertThat(r.at("/bookings/completed").asLong()).isEqualTo(1);
        assertThat(r.at("/bookings/cancelled").asLong()).isEqualTo(1);
        assertThat(r.at("/bookings/completedValueHalalas").asLong()).isEqualTo(30000);
        assertThat(r.at("/revenue/invoicedHalalas").asLong()).isEqualTo(30000); // no VAT number → no VAT
        assertThat(r.at("/revenue/collectedHalalas").asLong()).isEqualTo(10000);
        assertThat(r.at("/revenue/outstandingHalalas").asLong()).isEqualTo(20000);
        assertThat(r.at("/customers/newCustomers").asLong()).isEqualTo(1);
        assertThat(r.get("daily").size()).isEqualTo(2);
        assertThat(r.at("/daily/1/bookings").asLong()).isEqualTo(2);
        assertThat(r.at("/topServices/0/name").asText()).isEqualTo("تنظيف شقة");
        assertThat(r.at("/technicians/0/name").asText()).isEqualTo("فني التقارير");
        assertThat(r.at("/technicians/0/completed").asLong()).isEqualTo(1);
        assertThat(r.at("/technicians/0/hours").asDouble()).isEqualTo(2.0);

        // Another company sees none of it.
        Session other = signupCompany("rep-other");
        getAs(other, "/api/v1/reports/summary?from=" + from + "&to=" + to)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bookings.total").value(0))
                .andExpect(jsonPath("$.revenue.outstandingHalalas").value(0))
                .andExpect(jsonPath("$.technicians.length()").value(0));

        getAs(owner, "/api/v1/reports/summary?from=" + to + "&to=" + from)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_range"));
    }

    @Test
    void reportsAreForOwnersOnly() throws Exception {
        Session owner = signupCompany("rep-roles");
        String phone = uniquePhone();
        postAs(owner, "/api/v1/users", Map.of("name", "منسقة", "phone", phone, "password", "Coord#12345",
                "role", "COORDINATOR")).andExpect(status().isCreated());
        Session coordinator = login(phone, "Coord#12345");
        getAs(coordinator, "/api/v1/reports/summary?from=2026-10-01&to=2026-10-31").andExpect(status().isForbidden());
    }

    private String booking(Session owner, String customer, String service, LocalDate day, int hour) throws Exception {
        return readJson(postAs(owner, "/api/v1/bookings", Map.of(
                "customerId", customer,
                "scheduledStart", day.atTime(hour, 0).atZone(RIYADH).toInstant().toString(),
                "items", List.of(Map.of("serviceId", service))))
                .andExpect(status().isCreated())).get("id").asText();
    }
}
