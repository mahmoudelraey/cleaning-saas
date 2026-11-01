package com.fieldops.app.common.persistence;

import java.util.UUID;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import com.fieldops.app.common.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gap-free sequential numbers per tenant (booking #, invoice #). The upsert takes a row lock, so two
 * concurrent callers get different numbers, and because it runs inside the caller's transaction a
 * rollback also returns the number: no gaps (required for invoices).
 */
@Service
public class TenantCounterService {

    public static final String BOOKING = "booking";
    public static final String INVOICE = "invoice";
    public static final String QUOTE = "quote";

    @PersistenceContext
    private EntityManager em;

    @Transactional(propagation = Propagation.MANDATORY)
    public long next(String counter) {
        UUID tenantId = TenantContext.require();
        Number value = (Number) em.createNativeQuery("""
                        insert into tenant_counters (tenant_id, name, next_value) values (:tenant, :name, 2)
                        on conflict (tenant_id, name) do update set next_value = tenant_counters.next_value + 1
                        returning next_value - 1
                        """)
                .setParameter("tenant", tenantId)
                .setParameter("name", counter)
                .getSingleResult();
        return value.longValue();
    }
}
