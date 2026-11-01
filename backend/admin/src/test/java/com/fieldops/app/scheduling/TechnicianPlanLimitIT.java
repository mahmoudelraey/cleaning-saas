package com.fieldops.app.scheduling;

import java.util.Map;

import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TechnicianPlanLimitIT extends IntegrationTest {

    @Test
    void trialOnProPlanAllowsTenActiveTechnicians() throws Exception {
        Session owner = signupCompany("limit");
        for (int i = 0; i < 10; i++) {
            postAs(owner, "/api/v1/technicians", Map.of("name", "فني " + i, "phone", uniquePhone(),
                    "password", "Tech#123456")).andExpect(status().isCreated());
        }
        postAs(owner, "/api/v1/technicians", Map.of("name", "فني زائد", "phone", uniquePhone(),
                "password", "Tech#123456"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("plan_technician_limit"));
    }

    @Test
    void overlappingShiftsAreRejected() throws Exception {
        Session owner = signupCompany("shifts");
        postAs(owner, "/api/v1/technicians", Map.of("name", "فني", "phone", uniquePhone(), "password", "Tech#123456",
                "workHours", java.util.List.of(
                        Map.of("day", "MONDAY", "start", "08:00", "end", "12:00"),
                        Map.of("day", "MONDAY", "start", "11:00", "end", "15:00"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("overlapping_work_hours"));
    }
}
