package com.fieldops.app.booking;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VisitEventRepository extends JpaRepository<VisitEvent, UUID> {

    List<VisitEvent> findByBookingIdOrderByCreatedAtAsc(UUID bookingId);
}
