package com.fieldops.portal;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Customer portal API. Customers of each company sign in with their mobile (one-time code) at
 * {@code /{company-slug}}, see their visits and invoices, book and cancel.
 *
 * <p>Runs on the shared {@code core} module ({@code com.fieldops.app}): the same entities, services and
 * database rules (Row Level Security per company) as the admin app, against the same database. The admin
 * app owns the schema (Flyway) and runs the background jobs (sending messages, reminders, invoices).
 */
@SpringBootApplication(scanBasePackages = {"com.fieldops.portal", "com.fieldops.app"})
@EntityScan("com.fieldops.app")
@EnableJpaRepositories("com.fieldops.app")
@ConfigurationPropertiesScan({"com.fieldops.portal", "com.fieldops.app"})
public class PortalApplication {

    public static void main(String[] args) {
        SpringApplication.run(PortalApplication.class, args);
    }
}
