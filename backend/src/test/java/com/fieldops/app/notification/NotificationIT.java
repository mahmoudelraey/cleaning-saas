package com.fieldops.app.notification;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.fasterxml.jackson.databind.JsonNode;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.support.IntegrationTest;
import com.fieldops.app.tenant.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class NotificationIT extends IntegrationTest {

    @Autowired
    private NotificationDispatcher dispatcher;

    @Autowired
    private ReminderService reminders;

    @Autowired
    private TenantRepository tenants;

    @Autowired
    private NotificationRefRepository refs;

    @Autowired
    private JdbcTemplate jdbc;

    private Session owner;
    private String customer;
    private String service;
    private String techId;

    @BeforeEach
    void seed() throws Exception {
        owner = signupCompany("notify");
        customer = readJson(postAs(owner, "/api/v1/customers", Map.of("name", "نورة القحطاني", "phone", uniquePhone())))
                .get("id").asText();
        service = readJson(postAs(owner, "/api/v1/services", Map.of("name", "s", "pricingType", "FIXED",
                "basePriceHalalas", 100, "durationMin", 60))).get("id").asText();
        techId = readJson(postAs(owner, "/api/v1/technicians", Map.of("name", "محمد إقبال", "phone", uniquePhone(),
                "password", "Tech#123456"))).get("id").asText();
    }

    private String book(Instant start) throws Exception {
        return readJson(postAs(owner, "/api/v1/bookings", Map.of("customerId", customer,
                "scheduledStart", start.toString(), "items", List.of(Map.of("serviceId", service)),
                "technicianIds", List.of(techId), "force", true))).get("id").asText();
    }

    private JsonNode log(String bookingId) throws Exception {
        return readJson(getAs(owner, "/api/v1/notifications?bookingId=" + bookingId)).get("items");
    }

    @Test
    void confirmationIsQueuedThenSentThroughLogChannel() throws Exception {
        String id = book(Instant.now().plus(Duration.ofDays(2)));
        JsonNode items = log(id);
        assertThat(items.size()).isEqualTo(1);
        assertThat(items.get(0).get("template").asText()).isEqualTo("BOOKING_CONFIRMED");
        assertThat(items.get(0).get("status").asText()).isEqualTo("PENDING");
        assertThat(items.get(0).get("body").asText()).contains("نورة").doesNotContain("القحطاني");

        assertThat(dispatcher.dispatchTenant(owner.tenantId())).isEqualTo(1);
        JsonNode sent = log(id).get(0);
        assertThat(sent.get("status").asText()).isEqualTo("SENT");
        assertThat(sent.get("channel").asText()).isEqualTo("LOG");
    }

    @Test
    void onTheWayNamesTheTechnicianAndInternalStepsStaySilent() throws Exception {
        String id = book(Instant.now().plus(Duration.ofHours(1)));
        String techPhone = jdbc.queryForObject("select u.phone from users u join technicians t on t.user_id = u.id where t.id = ?::uuid",
                String.class, techId);
        Session tech = login(techPhone, "Tech#123456");
        mvc.perform(patch("/api/v1/bookings/" + id + "/status").header("Authorization", "Bearer " + tech.accessToken())
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ON_THE_WAY\"}")).andExpect(status().isOk());
        mvc.perform(patch("/api/v1/bookings/" + id + "/status").header("Authorization", "Bearer " + tech.accessToken())
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"IN_PROGRESS\"}")).andExpect(status().isOk());

        List<String> templates = new java.util.ArrayList<>();
        log(id).forEach(n -> templates.add(n.get("template").asText()));
        assertThat(templates).containsExactlyInAnyOrder("BOOKING_CONFIRMED", "TECHNICIAN_ON_THE_WAY");
        JsonNode onTheWay = java.util.stream.StreamSupport.stream(log(id).spliterator(), false)
                .filter(n -> n.get("template").asText().equals("TECHNICIAN_ON_THE_WAY")).findFirst().orElseThrow();
        assertThat(onTheWay.get("body").asText()).contains("محمد");
    }

    @Test
    void companyCanTurnMessagesOff() throws Exception {
        putAs(owner, "/api/v1/tenant/notification-settings", Map.of("confirmation", false, "reminder", true,
                "onTheWay", true, "completed", true, "cancelled", true, "reminderHours", 3)).andExpect(status().isOk());
        String id = book(Instant.now().plus(Duration.ofDays(2)));
        assertThat(log(id).size()).isZero();
    }

    @Test
    void remindersAreQueuedOnceAndNotForLastMinuteBookings() throws Exception {
        String lastMinute = book(Instant.now().plus(Duration.ofHours(2)));
        String planned = book(Instant.now().plus(Duration.ofHours(2)).plus(Duration.ofMinutes(90)));
        // Pretend "planned" was booked two days ago.
        jdbc.update("update bookings set created_at = now() - interval '2 days' where id = ?::uuid", planned);
        jdbc.update("update bookings set scheduled_start = now() + interval '150 minutes', scheduled_end = now() + interval '210 minutes' where id = ?::uuid", planned);

        var tenant = tenants.findById(owner.tenantId()).orElseThrow();
        assertThat(reminders.queueForTenant(tenant, Instant.now())).isEqualTo(1);
        assertThat(reminders.queueForTenant(tenant, Instant.now())).isZero();

        assertThat(log(planned).toString()).contains("BOOKING_REMINDER");
        assertThat(log(lastMinute).toString()).doesNotContain("BOOKING_REMINDER");
    }

    @Test
    void webhookRequiresValidSignatureAndUpdatesDelivery() throws Exception {
        String id = book(Instant.now().plus(Duration.ofDays(2)));
        dispatcher.dispatchTenant(owner.tenantId());
        String notificationId = log(id).get(0).get("id").asText();
        refs.save(new NotificationRef("wamid.TEST1", owner.tenantId(), java.util.UUID.fromString(notificationId)));

        String payload = "{\"entry\":[{\"changes\":[{\"value\":{\"statuses\":[{\"id\":\"wamid.TEST1\",\"status\":\"read\",\"timestamp\":\"1792650000\"}]}}]}]}";
        mvc.perform(post("/api/v1/webhooks/whatsapp").contentType(MediaType.APPLICATION_JSON).content(payload)
                .header("X-Hub-Signature-256", "sha256=" + "00".repeat(32))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/webhooks/whatsapp").contentType(MediaType.APPLICATION_JSON).content(payload)
                .header("X-Hub-Signature-256", "sha256=" + hmac(payload))).andExpect(status().isOk());

        assertThat(log(id).get(0).get("status").asText()).isEqualTo("READ");
    }

    @Test
    void sendLogIsPerCompany() throws Exception {
        book(Instant.now().plus(Duration.ofDays(2)));
        Session other = signupCompany("notify-b");
        assertThat(readJson(getAs(other, "/api/v1/notifications")).get("total").asLong()).isZero();
        assertThat(TenantContext.current()).isEmpty();
    }

    private static String hmac(String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("test-webhook-secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }
}
