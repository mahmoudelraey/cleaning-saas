package com.fieldops.portal.me;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.customer.Customer;
import com.fieldops.app.customerportal.CustomerPortalService;
import com.fieldops.portal.db.TenantJdbc;
import com.fieldops.portal.security.CurrentCustomer;
import com.fieldops.portal.security.CustomerTokenService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/portal/{slug}/me")
public class MeController {

    private final TenantJdbc db;
    private final CustomerPortalService portal;
    private final CustomerTokenService tokens;

    public MeController(TenantJdbc db, CustomerPortalService portal, CustomerTokenService tokens) {
        this.db = db;
        this.portal = portal;
        this.tokens = tokens;
    }

    @GetMapping
    public Profile me(@PathVariable String slug) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        return db.read(me.tenantId(), q -> {
            Map<String, Object> p = Map.of("t", me.tenantId(), "c", me.customerId());
            List<Profile> rows = q.query("""
                    select id, name, phone, email from customers
                    where tenant_id = :t and id = :c and deleted_at is null
                    """, p, (rs, i) -> new Profile(rs.getObject("id", UUID.class), rs.getString("name"),
                    rs.getString("phone"), rs.getString("email"), List.of(), null, null));
            if (rows.isEmpty()) {
                throw ApiException.notFound("customer");
            }
            List<Address> addresses = q.query("""
                    select id, label, city, district, details, map_url from addresses
                    where tenant_id = :t and customer_id = :c and deleted_at is null order by created_at
                    """, p, (rs, i) -> new Address(rs.getObject("id", UUID.class), rs.getString("label"),
                    rs.getString("city"), rs.getString("district"), rs.getString("details"), rs.getString("map_url")));
            Profile base = rows.get(0);
            return new Profile(base.id(), base.name(), base.phone(), base.email(), addresses, null, null);
        });
    }

    /** Name/email change; returns a fresh token because the name is in it. */
    @PutMapping
    public Profile update(@PathVariable String slug, @Valid @RequestBody ProfileRequest req) {
        CurrentCustomer me = CurrentCustomer.require(slug);
        Customer c = portal.rename(slug, me.customerId(), req.name(), req.email());
        CustomerTokenService.Issued t = tokens.issue(me.tenantId(), me.slug(), c.getPhone(), c.getId(), c.getName());
        Profile p = me(slug);
        return new Profile(p.id(), p.name(), p.phone(), p.email(), p.addresses(), t.token(), t.expiresAt());
    }

    public record Address(UUID id, String label, String city, String district, String details, String mapUrl) {
    }

    public record Profile(UUID id, String name, String phone, String email, List<Address> addresses, String token,
                          Instant tokenExpiresAt) {
    }

    public record ProfileRequest(@NotBlank @Size(max = 150) String name, @Email @Size(max = 200) String email) {
    }
}
