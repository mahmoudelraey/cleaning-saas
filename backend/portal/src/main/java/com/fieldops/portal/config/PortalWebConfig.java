package com.fieldops.portal.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Registers {@link PortalAccessInterceptor} on the portal API. */
@Configuration
public class PortalWebConfig implements WebMvcConfigurer {

    private final PortalAccessInterceptor access;

    public PortalWebConfig(PortalAccessInterceptor access) {
        this.access = access;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(access).addPathPatterns("/api/portal/**");
    }
}
