package com.fieldops.app.scheduling;

import com.fieldops.app.common.audit.AuditNames;
import com.fieldops.app.common.audit.Audited;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import com.fieldops.app.review.ReviewService;
import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.util.SaudiMobile;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/technicians")
public class TechnicianController {

    private final TechnicianService service;
    private final ReviewService reviews;
    private final AuditNames audits;

    public TechnicianController(TechnicianService service, ReviewService reviews, AuditNames audits) {
        this.service = service;
        this.reviews = reviews;
        this.audits = audits;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public List<Audited<TechnicianDto>> list() {
        Map<UUID, ReviewService.TechnicianRating> ratings = reviews.technicianRatings();
        return audits.list(service.list(), t -> TechnicianDto.of(t, ratings.get(t.getId())));
    }

    /** The technician's own profile, with the rating customers gave their visits. */
    @GetMapping("/me")
    @PreAuthorize("hasRole('TECHNICIAN')")
    public TechnicianDto me() {
        Technician t = service.getByUser(CurrentUser.id());
        return TechnicianDto.of(t, reviews.technicianRatings().get(t.getId()));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
    public TechnicianDto get(@PathVariable UUID id) {
        return TechnicianDto.of(service.get(id), reviews.technicianRatings().get(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('OWNER')")
    public TechnicianDto create(@Valid @RequestBody CreateTechnicianRequest req) {
        return TechnicianDto.of(service.create(new TechnicianService.CreateData(
                req.name(), req.phone(), req.email(), req.password(), req.skills(), req.workHours(), req.color())));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('OWNER')")
    public TechnicianDto update(@PathVariable UUID id, @Valid @RequestBody UpdateTechnicianRequest req) {
        return TechnicianDto.of(service.update(id, new TechnicianService.UpdateData(
                req.name(), req.email(), req.skills(), req.workHours(), req.color(), req.active())));
    }

    @PostMapping("/{id}/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('OWNER')")
    public void resetPassword(@PathVariable UUID id, @Valid @RequestBody ResetPasswordRequest req) {
        service.resetPassword(id, req.password());
    }

    public record ResetPasswordRequest(@NotBlank @Size(min = 8, max = 100) String password) {
    }

    // --- DTOs ---------------------------------------------------------------------------------------

    private static final String HEX_COLOR = "^$|^#[0-9A-Fa-f]{6}$";

    public record CreateTechnicianRequest(
            @NotBlank @Size(max = 150) String name,
            @NotBlank @SaudiMobile String phone,
            @Email @Size(max = 200) String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @Size(max = 20) List<@NotBlank @Size(max = 50) String> skills,
            @Size(max = 21) List<@Valid WorkShift> workHours,
            @Pattern(regexp = HEX_COLOR) String color) {
    }

    public record UpdateTechnicianRequest(
            @NotBlank @Size(max = 150) String name,
            @Email @Size(max = 200) String email,
            @Size(max = 20) List<@NotBlank @Size(max = 50) String> skills,
            @Size(max = 21) List<@Valid WorkShift> workHours,
            @Pattern(regexp = HEX_COLOR) String color,
            boolean active) {
    }

    public record TechnicianDto(UUID id, UUID userId, String name, String phone, String email,
                                List<String> skills, List<WorkShift> workHours, String color, boolean active,
                                boolean mustChangePassword, java.time.Instant lastLoginAt,
                                Double ratingAverage, long ratingCount) {
        static TechnicianDto of(Technician t) {
            return of(t, null);
        }

        /** {@code rating} null: no rated visits yet (average null, count 0). */
        static TechnicianDto of(Technician t, ReviewService.TechnicianRating rating) {
            return new TechnicianDto(t.getId(), t.getUser().getId(), t.getUser().getName(), t.getUser().getPhone(),
                    t.getUser().getEmail(), t.getSkills(), t.getWorkHours(), t.getColor(), t.isActive(),
                    t.getUser().isMustChangePassword(), t.getUser().getLastLoginAt(),
                    rating == null ? null : rating.average(), rating == null ? 0 : rating.count());
        }
    }
}
