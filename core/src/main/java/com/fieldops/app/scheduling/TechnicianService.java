package com.fieldops.app.scheduling;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fieldops.app.auth.User;
import com.fieldops.app.auth.UserService;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.tenant.Plan;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.app.tenant.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TechnicianService {

    public static final String DEFAULT_COLOR = "#0EA5A4";

    private final TechnicianRepository technicians;
    private final UserService users;
    private final TenantService tenants;

    public TechnicianService(TechnicianRepository technicians, UserService users, TenantService tenants) {
        this.technicians = technicians;
        this.users = users;
        this.tenants = tenants;
    }

    public record CreateData(String name, String phone, String email, String password, List<String> skills,
                             List<WorkShift> workHours, String color) {
    }

    public record UpdateData(String name, String email, List<String> skills, List<WorkShift> workHours,
                             String color, boolean active) {
    }

    @Transactional(readOnly = true)
    public List<Technician> list() {
        return technicians.findAllWithUser();
    }

    @Transactional(readOnly = true)
    public Technician get(UUID id) {
        return technicians.findWithUser(id).orElseThrow(() -> ApiException.notFound("technician"));
    }

    /** Owner sets a temporary password; the technician must change it at next sign-in. */
    @Transactional
    public void resetPassword(UUID id, String password) {
        users.resetPassword(get(id).getUser().getId(), password);
    }

    @Transactional(readOnly = true)
    public Technician getByUser(UUID userId) {
        return technicians.findByUserId(userId).orElseThrow(() -> ApiException.notFound("technician"));
    }

    @Transactional
    public Technician create(CreateData d) {
        assertWithinPlanLimit();
        List<WorkShift> hours = validateWorkHours(d.workHours());
        User user = users.create(d.name(), d.phone(), d.email(), d.password(), Role.TECHNICIAN);
        return technicians.save(new Technician(user, cleanSkills(d.skills()), hours, colorOrDefault(d.color())));
    }

    @Transactional
    public Technician update(UUID id, UpdateData d) {
        Technician t = get(id);
        if (d.active() && !t.isActive()) {
            assertWithinPlanLimit();
        }
        t.update(cleanSkills(d.skills()), validateWorkHours(d.workHours()), colorOrDefault(d.color()));
        t.setActive(d.active());
        User u = t.getUser();
        users.update(u.getId(), d.name(), d.email(), Role.TECHNICIAN, d.active());
        return t;
    }

    /** Pricing is per technician (plan section 8), so the plan caps active technicians. */
    private void assertWithinPlanLimit() {
        Tenant tenant = tenants.current();
        Plan plan = tenants.planOf(tenant);
        if (technicians.countByActiveTrue() >= plan.getMaxTechnicians()) {
            throw ApiException.conflict("plan_technician_limit",
                    "Your plan allows up to " + plan.getMaxTechnicians() + " active technicians");
        }
    }

    static List<WorkShift> validateWorkHours(List<WorkShift> input) {
        List<WorkShift> shifts = input == null ? List.of() : input;
        Map<DayOfWeek, List<WorkShift>> byDay = new EnumMap<>(DayOfWeek.class);
        for (WorkShift s : shifts) {
            if (!s.startTime().isBefore(s.endTime())) {
                throw ApiException.badRequest("invalid_work_hours", "Shift start must be before its end");
            }
            byDay.computeIfAbsent(s.day(), k -> new ArrayList<>()).add(s);
        }
        List<WorkShift> sorted = new ArrayList<>();
        for (List<WorkShift> day : byDay.values()) {
            day.sort(Comparator.comparing(WorkShift::startTime));
            for (int i = 1; i < day.size(); i++) {
                if (day.get(i).startTime().isBefore(day.get(i - 1).endTime())) {
                    throw ApiException.badRequest("overlapping_work_hours", "Shifts on the same day overlap");
                }
            }
            sorted.addAll(day);
        }
        return sorted;
    }

    private static List<String> cleanSkills(List<String> skills) {
        if (skills == null) {
            return List.of();
        }
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String s : skills) {
            if (s != null && !s.isBlank()) {
                unique.add(s.trim());
            }
        }
        return List.copyOf(unique);
    }

    private static String colorOrDefault(String color) {
        return color == null || color.isBlank() ? DEFAULT_COLOR : color.toUpperCase();
    }
}
