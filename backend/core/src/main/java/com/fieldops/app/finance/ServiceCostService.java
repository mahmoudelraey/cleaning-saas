package com.fieldops.app.finance;

import java.util.UUID;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The owner's direct cost per unit of a service (per visit, hour or m², like its price), used for service
 * profitability. Kept apart from the catalog so coordinators who manage services never see costs.
 */
@Service
public class ServiceCostService {

    @PersistenceContext
    private EntityManager em;

    /** @param costHalalas null clears the cost (profitability then shows "unknown" unless expenses are tagged) */
    @Transactional
    public void setCost(UUID serviceId, Long costHalalas) {
        if (costHalalas != null && costHalalas < 0) {
            throw ApiException.badRequest("negative_amount", "The cost cannot be negative");
        }
        int updated = em.createNativeQuery("update services set cost_halalas = cast(:c as bigint), updated_at = now() where id = :id and tenant_id = :t")
                .setParameter("c", costHalalas)
                .setParameter("id", serviceId)
                .setParameter("t", TenantContext.require())
                .executeUpdate();
        if (updated == 0) {
            throw ApiException.notFound("service");
        }
    }
}
