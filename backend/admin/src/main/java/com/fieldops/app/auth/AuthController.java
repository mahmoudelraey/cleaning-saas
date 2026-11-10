package com.fieldops.app.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fieldops.app.common.security.CurrentUser;
import com.fieldops.app.common.util.SaudiMobile;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthService.Tokens signup(@Valid @RequestBody SignupRequest req) {
        return auth.signup(req.companyName(), req.companyNameEn(), req.slug(), req.ownerName(), req.phone(), req.email(),
                req.password());
    }

    @PostMapping("/login")
    public AuthService.Tokens login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req.identifier(), req.password());
    }

    @PostMapping("/refresh")
    public AuthService.Tokens refresh(@Valid @RequestBody RefreshRequest req) {
        return auth.refresh(req.refreshToken());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody RefreshRequest req) {
        auth.logout(req.refreshToken());
    }

    /** Signed-in user replaces their password; returns fresh tokens (other sessions are signed out). */
    @PostMapping("/change-password")
    public AuthService.Tokens changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        return auth.changePassword(CurrentUser.id(), req.currentPassword(), req.newPassword());
    }

    @GetMapping("/me")
    public AuthService.UserView me() {
        return auth.me(CurrentUser.id());
    }

    public record SignupRequest(
            @NotBlank @Size(max = 150) String companyName,
            @NotBlank @Size(max = 150) String companyNameEn,
            @NotBlank @Size(min = 3, max = 40) String slug,
            @NotBlank @Size(max = 150) String ownerName,
            @NotBlank @SaudiMobile String phone,
            @Email @Size(max = 200) String email,
            @NotBlank @Size(min = 8, max = 100) String password) {
    }

    /** {@code identifier} is a Saudi mobile number or an email address. */
    public record LoginRequest(@NotBlank @Size(max = 200) String identifier,
                               @NotBlank @Size(max = 100) String password) {
    }

    public record ChangePasswordRequest(@NotBlank @Size(max = 100) String currentPassword,
                                        @NotBlank @Size(min = 8, max = 100) String newPassword) {
    }

    public record RefreshRequest(@NotBlank @Size(max = 200) String refreshToken) {
    }
}
