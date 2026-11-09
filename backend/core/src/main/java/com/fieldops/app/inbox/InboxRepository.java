package com.fieldops.app.inbox;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InboxRepository extends JpaRepository<InboxNotification, UUID> {

    List<InboxNotification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable page);

    List<InboxNotification> findByCustomerIdOrderByCreatedAtDesc(UUID customerId, Pageable page);

    long countByUserIdAndReadAtIsNull(UUID userId);

    long countByCustomerIdAndReadAtIsNull(UUID customerId);

    @Modifying
    @Query("update InboxNotification n set n.readAt = :at where n.userId = :id and n.readAt is null")
    int markAllReadForUser(@Param("id") UUID userId, @Param("at") Instant at);

    @Modifying
    @Query("update InboxNotification n set n.readAt = :at where n.customerId = :id and n.readAt is null")
    int markAllReadForCustomer(@Param("id") UUID customerId, @Param("at") Instant at);
}
