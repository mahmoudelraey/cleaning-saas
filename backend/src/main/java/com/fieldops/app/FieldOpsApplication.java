package com.fieldops.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class FieldOpsApplication {

    public static void main(String[] args) {
        SpringApplication.run(FieldOpsApplication.class, args);
    }
}
