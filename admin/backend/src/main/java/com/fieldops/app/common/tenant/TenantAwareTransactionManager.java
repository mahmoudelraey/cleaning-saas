package com.fieldops.app.common.tenant;

import java.util.UUID;
import java.util.regex.Pattern;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Second isolation layer: at the start of every transaction, switch to the restricted DB role and
 * publish the tenant id to PostgreSQL so Row Level Security policies apply. Both settings are
 * {@code LOCAL}, so they end with the transaction and never leak through the connection pool.
 */
public class TenantAwareTransactionManager extends JpaTransactionManager {

    private static final Pattern ROLE_NAME = Pattern.compile("[a-z_][a-z0-9_]{0,62}");

    private final String rlsRole;

    public TenantAwareTransactionManager(EntityManagerFactory emf, String rlsRole) {
        super(emf);
        if (rlsRole != null && !rlsRole.isBlank() && !ROLE_NAME.matcher(rlsRole).matches()) {
            throw new IllegalArgumentException("Invalid RLS role name: " + rlsRole);
        }
        this.rlsRole = rlsRole;
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
        super.doBegin(transaction, definition);

        EntityManagerHolder holder =
                (EntityManagerHolder) TransactionSynchronizationManager.getResource(obtainEntityManagerFactory());
        if (holder == null) {
            return;
        }
        EntityManager em = holder.getEntityManager();
        UUID tenantId = TenantContext.currentOrNone();

        if (rlsRole != null && !rlsRole.isBlank()) {
            // Role name is validated in the constructor; SET cannot take bind parameters.
            em.createNativeQuery("SET LOCAL ROLE " + rlsRole).executeUpdate();
        }
        em.createNativeQuery("SELECT set_config('app.tenant_id', :tid, true)")
                .setParameter("tid", tenantId.toString())
                .getSingleResult();
    }
}
