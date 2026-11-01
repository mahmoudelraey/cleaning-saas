package com.fieldops.app.billing;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface QuoteRepository extends JpaRepository<Quote, UUID> {

    @Query("select distinct q from Quote q left join fetch q.lines where q.id = :id")
    Optional<Quote> findWithLines(@Param("id") UUID id);

    Page<Quote> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<Quote> findByStatusOrderByCreatedAtDesc(Quote.Status status, Pageable pageable);

    Page<Quote> findByCustomerIdOrderByCreatedAtDesc(UUID customerId, Pageable pageable);
}
