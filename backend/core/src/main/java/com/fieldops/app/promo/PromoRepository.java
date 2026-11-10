package com.fieldops.app.promo;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import com.fieldops.app.booking.BookingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PromoRepository extends JpaRepository<Promo, UUID> {

    List<Promo> findAllByOrderByCreatedAtDesc();

    Optional<Promo> findByCode(String code);

    /** The same, locked until the transaction ends: two customers cannot both take the last use of a code. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Promo p where p.code = :code")
    Optional<Promo> findByCodeForUpdate(@Param("code") String code);

    /** Candidates for the announcement bar, newest first (dates and usage are checked by the service). */
    List<Promo> findByAnnounceTrueAndActiveTrueOrderByCreatedAtDesc();

    /** Bookings made with a promo, not counting the given statuses (cancelled ones free their use). */
    @Query("select count(b) from Booking b where b.promoId = :promoId and b.status not in :excluded")
    long countUses(@Param("promoId") UUID promoId, @Param("excluded") Collection<BookingStatus> excluded);

    @Query("""
            select count(b) from Booking b
            where b.promoId = :promoId and b.customerId = :customerId and b.status not in :excluded""")
    long countUsesBy(@Param("promoId") UUID promoId, @Param("customerId") UUID customerId,
                     @Param("excluded") Collection<BookingStatus> excluded);

    /** The customer's earlier bookings with the company (for "first booking only"). */
    @Query("select count(b) from Booking b where b.customerId = :customerId and b.status not in :excluded")
    long countBookingsOf(@Param("customerId") UUID customerId, @Param("excluded") Collection<BookingStatus> excluded);

    /** Uses per promo, for the admin list: rows of [promoId, count]. */
    @Query("""
            select b.promoId, count(b) from Booking b
            where b.promoId in :ids and b.status not in :excluded group by b.promoId""")
    List<Object[]> countUsesByPromo(@Param("ids") Collection<UUID> ids, @Param("excluded") Collection<BookingStatus> excluded);
}
