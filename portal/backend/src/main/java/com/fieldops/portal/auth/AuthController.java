package com.fieldops.portal.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fieldops.portal.admin.AdminClient;
import com.fieldops.portal.admin.AdminDtos;
import com.fieldops.portal.company.CompanyService;
import com.fieldops.portal.security.CurrentCustomer;
import com.fieldops.portal.security.CustomerTokenService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Sign-in with mobile + one-time code (sent by the admin backend over WhatsApp/SMS). A returning
 * customer gets a full token; a first-time visitor gets a token without {@code cid} and must send their
 * name to {@code /auth/register} before using the rest of the portal.
 */
@RestController
@RequestMapping("/api/portal/{slug}/auth")
public class AuthController {

    private final AdminClient admin;
    private final CompanyService companies;
    private final CustomerTokenService tokens;

    public AuthController(AdminClient admin, CompanyService companies, CustomerTokenService tokens) {
        this.admin = admin;
        this.companies = companies;
        this.tokens = tokens;
    }

    @PostMapping("/otp")
    public AdminDtos.Otp sendCode(@PathVariable String slug, @Valid @RequestBody PhoneRequest req) {
        return admin.post(slug, "/otp", new AdminDtos.PhoneBody(req.phone()), AdminDtos.Otp.class);
    }

    @PostMapping("/verify")
    public Session verify(@PathVariable String slug, @Valid @RequestBody VerifyRequest req) {
        AdminDtos.Identity id = admin.post(slug, "/otp/verify", new AdminDtos.VerifyBody(req.phone(), req.code()),
                AdminDtos.Identity.class);
        AdminDtos.Company company = companies.get(slug);
        CustomerTokenService.Issued t = tokens.issue(company.tenantId(), company.slug(), id.phone(), id.customerId(),
                id.customerName());
        return new Session(t.token(), t.expiresAt(), id.customerId(), id.customerName(), id.phone(), id.customerId() == null);
    }

    @PostMapping("/register")
    public Session register(@PathVariable String slug, @Valid @RequestBody RegisterRequest req) {
        CurrentCustomer me = CurrentCustomer.require(slug, false);
        AdminDtos.Customer c = admin.post(slug, "/customers", new AdminDtos.RegisterBody(me.phone(), req.name()),
                AdminDtos.Customer.class);
        CustomerTokenService.Issued t = tokens.issue(me.tenantId(), me.slug(), c.phone(), c.id(), c.name());
        return new Session(t.token(), t.expiresAt(), c.id(), c.name(), c.phone(), false);
    }

    public record PhoneRequest(@NotBlank @Size(max = 20) String phone) {
    }

    public record VerifyRequest(@NotBlank @Size(max = 20) String phone, @NotBlank @Size(max = 6) String code) {
    }

    public record RegisterRequest(@NotBlank @Size(max = 150) String name) {
    }

    public record Session(String token, Instant expiresAt, UUID customerId, String name, String phone, boolean needsName) {
    }
}
