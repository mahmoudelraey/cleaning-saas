package com.fieldops.app.billing;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    List<Payment> findByInvoiceIdOrderByPaidAtAsc(UUID invoiceId);

    @Query("select coalesce(sum(p.amountHalalas), 0) from Payment p where p.paidAt >= :from and p.paidAt < :to")
    long sumPaidBetween(@Param("from") Instant from, @Param("to") Instant to);
}
