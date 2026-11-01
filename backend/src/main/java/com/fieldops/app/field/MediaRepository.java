package com.fieldops.app.field;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaRepository extends JpaRepository<Media, UUID> {

    List<Media> findByBookingIdOrderByCreatedAtAsc(UUID bookingId);

    @Query("select m.bookingId, count(m) from Media m where m.bookingId in :ids group by m.bookingId")
    List<Object[]> countByBookings(@Param("ids") Collection<UUID> bookingIds);

    long countByBookingIdAndKind(UUID bookingId, Media.Kind kind);
}
