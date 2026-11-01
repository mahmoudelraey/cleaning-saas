package com.fieldops.portal.security;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import com.fieldops.portal.config.PortalProperties;
import com.fieldops.app.common.web.ApiException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CustomerTokenServiceTest {

    private static PortalProperties props(String secret) {
        return new PortalProperties("http://admin",
                new PortalProperties.Security(new PortalProperties.Jwt(secret, "fieldops-portal", Duration.ofDays(30)),
                        List.of("http://localhost:4300")),
                new PortalProperties.RateLimit(10));
    }

    private static final String SECRET = "cG9ydGFsLXRlc3Qtc2VjcmV0LXBvcnRhbC10ZXN0LXNlY3JldC0xMjM0NQ==";

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static void signIn(Jwt jwt) {
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
    }

    @Test
    void tokenCarriesCompanyAndCustomerAndOnlyWorksForThatCompany() {
        CustomerTokenService tokens = new CustomerTokenService(props(SECRET));
        UUID tenant = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        String token = tokens.issue(tenant, "lamaa", "+966551234567", customer, "هند").token();

        signIn(tokens.decoder().decode(token));
        CurrentCustomer me = CurrentCustomer.require("lamaa");
        assertThat(me.tenantId()).isEqualTo(tenant);
        assertThat(me.customerId()).isEqualTo(customer);
        assertThat(me.phone()).isEqualTo("+966551234567");

        assertThatThrownBy(() -> CurrentCustomer.require("other-company"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("wrong_company");
    }

    @Test
    void firstTimeVisitorMustRegisterBeforeUsingThePortal() {
        CustomerTokenService tokens = new CustomerTokenService(props(SECRET));
        signIn(tokens.decoder().decode(tokens.issue(UUID.randomUUID(), "lamaa", "+966551234567", null, null).token()));
        assertThat(CurrentCustomer.require("lamaa", false).customerId()).isNull();
        assertThatThrownBy(() -> CurrentCustomer.require("lamaa"))
                .isInstanceOf(ApiException.class).extracting("code").isEqualTo("profile_required");
    }

    @Test
    void tokensFromAnotherKeyAreRejected() {
        String foreign = new CustomerTokenService(props("b3RoZXIta2V5LW90aGVyLWtleS1vdGhlci1rZXktb3RoZXIta2V5LTEy"))
                .issue(UUID.randomUUID(), "lamaa", "+966551234567", UUID.randomUUID(), "x").token();
        CustomerTokenService tokens = new CustomerTokenService(props(SECRET));
        assertThatThrownBy(() -> tokens.decoder().decode(foreign)).isNotNull();
    }
}
