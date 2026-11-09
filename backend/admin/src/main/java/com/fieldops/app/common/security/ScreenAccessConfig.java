package com.fieldops.app.common.security;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class ScreenAccessConfig implements WebMvcConfigurer {

    private final ScreenAccessInterceptor screens;

    public ScreenAccessConfig(ScreenAccessInterceptor screens) {
        this.screens = screens;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(screens).addPathPatterns("/api/v1/**");
    }
}
