package com.fieldops.app.customer;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** No tenant parameters needed: Hibernate @TenantId filters every query, RLS backs it up. */
public interface CustomerRepository extends JpaRepository<Customer, UUID> {

    @Query("""
            select c from Customer c
            where lower(c.name) like lower(concat('%', :q, '%'))
               or c.phone like concat('%', :q, '%')
            """)
    Page<Customer> search(@Param("q") String q, Pageable pageable);

    @EntityGraph(attributePaths = "addresses")
    @Query("select c from Customer c where c.id = :id")
    Optional<Customer> findWithAddresses(@Param("id") UUID id);

    boolean existsByPhone(String phone);

    @EntityGraph(attributePaths = "addresses")
    Optional<Customer> findByPhone(String phone);

    boolean existsByPhoneAndIdNot(String phone, UUID id);
}
