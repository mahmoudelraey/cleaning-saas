package com.fieldops.app.isolation;

import java.util.Map;
import java.util.UUID;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Proves the second isolation layer on its own. Native SQL bypasses Hibernate's @TenantId filter,
 * so anything these queries can or cannot see is decided purely by PostgreSQL RLS.
 */
class RowLevelSecurityIT extends IntegrationTest {

    @Autowired
    private TransactionTemplate tx;

    @PersistenceContext
    private EntityManager em;

    @Test
    void nativeQueriesOnlySeeCurrentTenantRows() throws Exception {
        Session a = signupCompany("rls-a");
        Session b = signupCompany("rls-b");
        postAs(a, "/api/v1/customers", Map.of("name", "RLS customer", "phone", uniquePhone()))
                .andExpect(status().isCreated());

        long seenByA = countCustomersAs(a.tenantId());
        long seenByB = countCustomersAs(b.tenantId());
        long seenWithoutTenant = countCustomersAs(TenantContext.NO_TENANT);

        assertThat(seenByA).isEqualTo(1);
        assertThat(seenByB).isZero();
        assertThat(seenWithoutTenant).isZero();
    }

    @Test
    void cannotInsertRowForAnotherTenant() throws Exception {
        Session a = signupCompany("rls-c");
        Session b = signupCompany("rls-d");

        assertThatThrownBy(() -> TenantContext.runAs(b.tenantId(), () -> tx.executeWithoutResult(s ->
                em.createNativeQuery("""
                                insert into customers (id, tenant_id, name, phone)
                                values (:id, :tenant, 'smuggled', '+966500000000')
                                """)
                        .setParameter("id", UUID.randomUUID())
                        .setParameter("tenant", a.tenantId())
                        .executeUpdate())))
                .hasStackTraceContaining("row-level security");
    }

    private long countCustomersAs(UUID tenantId) {
        return TenantContext.runAs(tenantId, () -> tx.execute(s ->
                ((Number) em.createNativeQuery("select count(*) from customers").getSingleResult()).longValue()));
    }
}
