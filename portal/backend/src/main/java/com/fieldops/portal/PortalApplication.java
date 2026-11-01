package com.fieldops.portal;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Customer portal API. Customers of each company sign in with their mobile (one-time code) at
 * {@code /p/{company-slug}}, see their visits and invoices, book and cancel.
 *
 * <p>Same PostgreSQL database as the admin app: screens are read directly (under the same Row Level
 * Security as the admin app), while every change goes through the admin backend's internal API so the
 * business rules live in one place.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class PortalApplication {

    public static void main(String[] args) {
        SpringApplication.run(PortalApplication.class, args);
    }
}
