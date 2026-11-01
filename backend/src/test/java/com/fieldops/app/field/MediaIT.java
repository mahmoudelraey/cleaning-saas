package com.fieldops.app.field;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;

import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MediaIT extends IntegrationTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F', 0, 1, 2, 3};

    private Session owner;
    private Session tech;
    private Session otherTech;
    private String bookingId;
    private LocalDate sunday;

    @BeforeEach
    void seed() throws Exception {
        owner = signupCompany("media");
        String customer = readJson(postAs(owner, "/api/v1/customers", Map.of("name", "c", "phone", uniquePhone()))).get("id").asText();
        String service = readJson(postAs(owner, "/api/v1/services", Map.of("name", "s", "pricingType", "FIXED",
                "basePriceHalalas", 100, "durationMin", 60))).get("id").asText();
        String techPhone = uniquePhone();
        String otherPhone = uniquePhone();
        String techId = readJson(postAs(owner, "/api/v1/technicians", Map.of("name", "t", "phone", techPhone,
                "password", "Tech#123456"))).get("id").asText();
        postAs(owner, "/api/v1/technicians", Map.of("name", "t2", "phone", otherPhone, "password", "Tech#123456"));
        ZoneId riyadh = ZoneId.of("Asia/Riyadh");
        sunday = LocalDate.now(riyadh).with(TemporalAdjusters.next(DayOfWeek.SUNDAY));
        bookingId = readJson(postAs(owner, "/api/v1/bookings", Map.of("customerId", customer,
                "scheduledStart", sunday.atTime(10, 0).atZone(riyadh).toInstant().toString(),
                "items", List.of(Map.of("serviceId", service)), "technicianIds", List.of(techId))))
                .get("id").asText();
        tech = login(techPhone, "Tech#123456");
        otherTech = login(otherPhone, "Tech#123456");
    }

    private org.springframework.test.web.servlet.ResultActions upload(Session s, String booking, byte[] bytes, String kind)
            throws Exception {
        return mvc.perform(multipart("/api/v1/visits/" + booking + "/media")
                .file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", bytes))
                .param("kind", kind)
                .header("Authorization", "Bearer " + s.accessToken()));
    }

    @Test
    void assignedTechnicianUploadsAndOfficeSeesPhotos() throws Exception {
        String id = readJson(upload(tech, bookingId, JPEG, "BEFORE").andExpect(status().isCreated())
                .andExpect(jsonPath("$.contentType").value("image/jpeg"))).get("id").asText();

        getAs(owner, "/api/v1/bookings/" + bookingId + "/media").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].kind").value("BEFORE"));
        byte[] body = mvc.perform(get("/api/v1/media/" + id + "/content").header("Authorization", "Bearer " + owner.accessToken()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertThat(body).isEqualTo(JPEG);

        // Timeline records it.
        getAs(owner, "/api/v1/bookings/" + bookingId).andExpect(jsonPath("$.events[?(@.type=='PHOTO_ADDED')]").exists());
        // Technician's day view counts it.
        getAs(tech, "/api/v1/technicians/me/visits?date=" + sunday).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].photoCount").value(1))
                .andExpect(jsonPath("$[0].allowedTransitions[0]").value("ON_THE_WAY"));
    }

    @Test
    void nonImagesAreRejectedWhateverTheyClaimToBe() throws Exception {
        upload(tech, bookingId, "<html><script>alert(1)</script>".getBytes(), "BEFORE")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("unsupported_file"));
    }

    @Test
    void otherTechniciansAndCompaniesCannotSeeOrAdd() throws Exception {
        String id = readJson(upload(tech, bookingId, JPEG, "AFTER")).get("id").asText();
        upload(otherTech, bookingId, JPEG, "AFTER").andExpect(status().isNotFound());
        getAs(otherTech, "/api/v1/bookings/" + bookingId + "/media").andExpect(status().isNotFound());
        getAs(otherTech, "/api/v1/media/" + id + "/content").andExpect(status().isNotFound());

        Session stranger = signupCompany("media-b");
        getAs(stranger, "/api/v1/media/" + id + "/content").andExpect(status().isNotFound());
        upload(stranger, bookingId, JPEG, "AFTER").andExpect(status().isNotFound());
        deleteAs(stranger, "/api/v1/media/" + id).andExpect(status().isNotFound());
    }
}
