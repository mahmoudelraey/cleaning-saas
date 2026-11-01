package com.fieldops.app.notification;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    @Query("""
            select n from Notification n
            where n.status = :status and n.nextAttemptAt <= :now
            order by n.nextAttemptAt
            """)
    List<Notification> findDue(@Param("status") Notification.Status status, @Param("now") Instant now, Pageable limit);

    Page<Notification> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<Notification> findByBookingIdOrderByCreatedAtDesc(UUID bookingId, Pageable pageable);

    /** Messages actually handed to a channel since {@code since} (skipped/pending ones have no sent_at). */
    @Query("select count(n) from Notification n where n.sentAt >= :since and n.template <> :excluded")
    long countSentSince(@Param("since") Instant since, @Param("excluded") NotificationTemplate excluded);

    boolean existsByBookingIdAndTemplate(UUID bookingId, NotificationTemplate template);
}
