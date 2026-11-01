package com.fieldops.app.common.persistence;

import jakarta.persistence.EntityManagerFactory;

import com.fieldops.app.common.tenant.TenantAwareTransactionManager;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
public class PersistenceConfig {

    /** Replaces Boot's default JpaTransactionManager (it backs off when one is defined). */
    @Bean
    public PlatformTransactionManager transactionManager(EntityManagerFactory emf,
                                                         @Value("${app.db.rls-role:}") String rlsRole) {
        return new TenantAwareTransactionManager(emf, rlsRole);
    }
}
