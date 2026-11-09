package com.fieldops.app.auth;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.fieldops.app.common.security.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Users are not filtered by Hibernate's @TenantId (see {@link User}). Rule: outside of login/signup,
 * only call the methods that take {@code tenantId}, and pass {@code TenantContext.require()}.
 */
public interface UserRepository extends JpaRepository<User, UUID> {

    // --- Global lookups: authentication only -------------------------------------------------------

    Optional<User> findByPhone(String phone);

    boolean existsByRole(com.fieldops.app.common.security.Role role);

    /** The owner account(s) of a company (platform console). */
    List<User> findByTenantIdAndRole(UUID tenantId, com.fieldops.app.common.security.Role role);

    @Query("select u from User u where lower(u.email) = lower(:email)")
    Optional<User> findByEmailIgnoreCase(@Param("email") String email);

    boolean existsByPhone(String phone);

    @Query("select count(u) > 0 from User u where lower(u.email) = lower(:email)")
    boolean existsByEmailIgnoreCase(@Param("email") String email);

    // --- Tenant-scoped -----------------------------------------------------------------------------

    Optional<User> findByIdAndTenantId(UUID id, UUID tenantId);

    List<User> findByTenantIdOrderByNameAsc(UUID tenantId);

    long countByTenantIdAndRoleAndActiveTrue(UUID tenantId, Role role);
}
