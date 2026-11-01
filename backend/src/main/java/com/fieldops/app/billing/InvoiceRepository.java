package com.fieldops.app.billing;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    @Query("select distinct i from Invoice i left join fetch i.lines where i.id = :id")
    Optional<Invoice> findWithLines(@Param("id") UUID id);

    @Query("select i from Invoice i where i.bookingId = :bookingId and i.status <> :voidStatus")
    Optional<Invoice> findLiveForBooking(@Param("bookingId") UUID bookingId,
                                         @Param("voidStatus") Invoice.Status voidStatus);

    List<Invoice> findByBookingIdOrderByIssuedAtDesc(UUID bookingId);

    Optional<Invoice> findByQuoteIdAndStatusNot(UUID quoteId, Invoice.Status status);

    Page<Invoice> findAllByOrderByIssuedAtDesc(Pageable pageable);

    Page<Invoice> findByStatusInOrderByIssuedAtDesc(List<Invoice.Status> statuses, Pageable pageable);

    Page<Invoice> findByCustomerIdOrderByIssuedAtDesc(UUID customerId, Pageable pageable);

    @Query("select i from Invoice i where i.issuedAt >= :from and i.issuedAt < :to and i.status <> :voidStatus")
    List<Invoice> findIssuedBetween(@Param("from") Instant from, @Param("to") Instant to,
                                    @Param("voidStatus") Invoice.Status voidStatus);
}
