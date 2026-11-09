package com.fieldops.portal.config;

import java.util.List;

import com.fieldops.portal.security.AuthRateLimitFilter;
import com.fieldops.portal.security.CustomerTokenService;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http, PortalProperties props, AuthRateLimitFilter rateLimit) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> {
                    CorsConfiguration c = new CorsConfiguration();
                    c.setAllowedOrigins(props.security().corsOrigins());
                    c.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
                    c.setAllowedHeaders(List.of("Authorization", "Content-Type"));
                    c.setMaxAge(3600L);
                    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
                    source.registerCorsConfiguration("/api/**", c);
                    cors.configurationSource(source);
                })
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // The company card, its services and prices are public; so is signing in.
                        .requestMatchers(HttpMethod.GET, "/api/portal/*", "/api/portal/*/services", "/api/portal/*/reviews",
                                "/api/portal/*/google-reviews").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/portal/*/quote", "/api/portal/*/availability").permitAll()
                        .requestMatchers("/api/portal/*/auth/otp", "/api/portal/*/auth/verify").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/portal/*/contact").permitAll()
                        .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> { }))
                .addFilterBefore(rateLimit, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    JwtDecoder jwtDecoder(CustomerTokenService tokens) {
        return tokens.decoder();
    }

    /** The filter runs inside the security chain only (not a second time as a plain servlet filter). */
    @Bean
    FilterRegistrationBean<AuthRateLimitFilter> rateLimitRegistration(AuthRateLimitFilter filter) {
        FilterRegistrationBean<AuthRateLimitFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setEnabled(false);
        return reg;
    }
}
