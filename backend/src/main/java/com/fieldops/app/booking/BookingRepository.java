package com.fieldops.app.booking;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BookingRepository extends JpaRepository<Booking, UUID>, JpaSpecificationExecutor<Booking> {

    @EntityGraph(attributePaths = "items")
    @Query("select b from Booking b where b.id = :id")
    Optional<Booking> findWithItems(@Param("id") UUID id);

    /** Bookings overlapping [from, to), any status in the given set. */
    @Query("""
            select b from Booking b
            where b.scheduledStart < :to and b.scheduledEnd > :from and b.status in :statuses
            order by b.scheduledStart
            """)
    List<Booking> findOverlapping(@Param("from") Instant from, @Param("to") Instant to,
                                  @Param("statuses") Collection<BookingStatus> statuses);

    @Query("select b from Booking b where b.scheduledStart >= :from and b.scheduledStart < :to and b.status in :statuses")
    List<Booking> findStartingBetween(@Param("from") Instant from, @Param("to") Instant to,
                                      @Param("statuses") Collection<BookingStatus> statuses);

    Page<Booking> findByCustomerIdOrderByScheduledStartDesc(UUID customerId, Pageable pageable);

    /** Completed visits whose automatic invoice is due (oldest completion first). */
    @Query("""
            select b.id from Booking b
            where b.invoiceState = :state and (b.invoiceNextAt is null or b.invoiceNextAt <= :now)
            order by b.completedAt asc""")
    List<UUID> findInvoiceDue(@Param("state") Booking.InvoiceState state, @Param("now") Instant now,
                              org.springframework.data.domain.Pageable pageable);
}
