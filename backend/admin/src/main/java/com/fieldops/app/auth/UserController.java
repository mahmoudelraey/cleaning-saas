package com.fieldops.app.auth;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fieldops.app.common.security.Role;
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

/** Owner-only staff management (owners and coordinators; technicians are created via /technicians). */
@RestController
@RequestMapping("/api/v1/users")
@PreAuthorize("hasRole('OWNER')")
public class UserController {

    private final UserService service;

    public UserController(UserService service) {
        this.service = service;
    }

    @GetMapping
    public List<UserDto> list() {
        return service.list().stream().map(UserDto::of).toList();
    }

    @GetMapping("/{id}")
    public UserDto get(@PathVariable UUID id) {
        return UserDto.of(service.get(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto create(@Valid @RequestBody CreateUserRequest req) {
        if (req.role() == Role.TECHNICIAN) {
            throw com.fieldops.app.common.web.ApiException.badRequest(
                    "use_technicians_endpoint", "Create technicians from the technicians screen");
        }
        return UserDto.of(service.create(req.name(), req.phone(), req.email(), req.password(), req.role()));
    }

    @PutMapping("/{id}")
    public UserDto update(@PathVariable UUID id, @Valid @RequestBody UpdateUserRequest req) {
        return UserDto.of(service.update(id, req.name(), req.email(), req.role(), req.active()));
    }

    @PostMapping("/{id}/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@PathVariable UUID id, @Valid @RequestBody ResetPasswordRequest req) {
        service.resetPassword(id, req.password());
    }

    public record CreateUserRequest(
            @NotBlank @Size(max = 150) String name,
            @NotBlank @SaudiMobile String phone,
            @Email @Size(max = 200) String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotNull Role role) {
    }

    public record UpdateUserRequest(
            @NotBlank @Size(max = 150) String name,
            @Email @Size(max = 200) String email,
            @NotNull Role role,
            boolean active) {
    }

    public record ResetPasswordRequest(@NotBlank @Size(min = 8, max = 100) String password) {
    }

    public record UserDto(UUID id, String name, String phone, String email, Role role, boolean active,
                          Instant lastLoginAt, boolean mustChangePassword) {
        static UserDto of(User u) {
            return new UserDto(u.getId(), u.getName(), u.getPhone(), u.getEmail(), u.getRole(), u.isActive(),
                    u.getLastLoginAt(), u.isMustChangePassword());
        }
    }
}
