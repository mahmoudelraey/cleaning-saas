package com.fieldops.portal.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fieldops.app.customer.Customer;
import com.fieldops.app.customerportal.CustomerPortalService;
import com.fieldops.app.publicpage.OtpService;
import com.fieldops.app.tenant.Tenant;
import com.fieldops.portal.security.CurrentCustomer;
import com.fieldops.portal.security.CustomerTokenService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sign-in with mobile + one-time code (queued as a WhatsApp/SMS message; the admin app's job sends it).
 * A returning customer gets a full token; a first-time visitor gets a token without {@code cid} and
 * must send their name to {@code /auth/register} before using the rest of the portal.
 */
@RestController
@RequestMapping("/api/portal/{slug}/auth")
public class AuthController {

    private final CustomerPortalService portal;
    private final CustomerTokenService tokens;

    public AuthController(CustomerPortalService portal, CustomerTokenService tokens) {
        this.portal = portal;
        this.tokens = tokens;
    }

    @PostMapping("/otp")
    public OtpDto sendCode(@PathVariable String slug, @Valid @RequestBody PhoneRequest req) {
        OtpService.Sent s = portal.sendCode(slug, req.phone());
        return new OtpDto(s.expiresAt(), s.resendAfterSeconds(), s.devCode());
    }

    @PostMapping("/verify")
    public Session verify(@PathVariable String slug, @Valid @RequestBody VerifyRequest req) {
        CustomerPortalService.Identity id = portal.verify(slug, req.phone(), req.code());
        Tenant t = portal.company(slug);
        CustomerTokenService.Issued token = tokens.issue(t.getId(), t.getSlug(), id.phone(), id.customerId(), id.customerName());
        return new Session(token.token(), token.expiresAt(), id.customerId(), id.customerName(), id.phone(),
                id.customerId() == null);
    }

    @PostMapping("/register")
    public Session register(@PathVariable String slug, @Valid @RequestBody RegisterRequest req) {
        CurrentCustomer me = CurrentCustomer.require(slug, false);
        Customer c = portal.register(slug, me.phone(), req.name());
        CustomerTokenService.Issued token = tokens.issue(me.tenantId(), me.slug(), c.getPhone(), c.getId(), c.getName());
        return new Session(token.token(), token.expiresAt(), c.getId(), c.getName(), c.getPhone(), false);
    }

    public record PhoneRequest(@NotBlank @Size(max = 20) String phone) {
    }

    public record VerifyRequest(@NotBlank @Size(max = 20) String phone, @NotBlank @Size(max = 6) String code) {
    }

    public record RegisterRequest(@NotBlank @Size(max = 150) String name) {
    }

    public record OtpDto(Instant expiresAt, int resendAfterSeconds, String devCode) {
    }

    public record Session(String token, Instant expiresAt, UUID customerId, String name, String phone, boolean needsName) {
    }
}
