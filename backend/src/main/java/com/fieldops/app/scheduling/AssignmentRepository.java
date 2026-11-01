package com.fieldops.app.scheduling;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AssignmentRepository extends JpaRepository<Assignment, UUID> {

    @EntityGraph(attributePaths = {"technician", "technician.user"})
    @Query("select a from Assignment a where a.bookingId = :bookingId")
    List<Assignment> findByBooking(@Param("bookingId") UUID bookingId);

    @EntityGraph(attributePaths = {"technician", "technician.user"})
    @Query("select a from Assignment a where a.bookingId in :bookingIds")
    List<Assignment> findByBookings(@Param("bookingIds") Collection<UUID> bookingIds);

    /** Assignments of the given technicians overlapping [start, end), ignoring one booking (for reassign/reschedule). */
    @EntityGraph(attributePaths = {"technician", "technician.user"})
    @Query("""
            select a from Assignment a
            where a.technician.id in :technicianIds
              and a.startsAt < :end and a.endsAt > :start
              and a.bookingId <> :excludeBookingId
            """)
    List<Assignment> findConflicts(@Param("technicianIds") Collection<UUID> technicianIds,
                                   @Param("start") Instant start, @Param("end") Instant end,
                                   @Param("excludeBookingId") UUID excludeBookingId);

    @Query("select a from Assignment a where a.startsAt < :to and a.endsAt > :from")
    List<Assignment> findInRange(@Param("from") Instant from, @Param("to") Instant to);

    @Query("select a from Assignment a where a.technician.id = :technicianId and a.startsAt < :to and a.endsAt > :from order by a.startsAt")
    List<Assignment> findForTechnician(@Param("technicianId") UUID technicianId,
                                       @Param("from") Instant from, @Param("to") Instant to);

    boolean existsByBookingIdAndTechnicianId(UUID bookingId, UUID technicianId);

    @Modifying(flushAutomatically = true, clearAutomatically = false)
    @Query("delete from Assignment a where a.bookingId = :bookingId")
    int deleteByBooking(@Param("bookingId") UUID bookingId);
}
