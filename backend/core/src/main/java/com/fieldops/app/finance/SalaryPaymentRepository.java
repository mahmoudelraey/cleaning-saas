package com.fieldops.app.finance;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SalaryPaymentRepository extends JpaRepository<SalaryPayment, UUID> {

    List<SalaryPayment> findBySalaryRecordIdOrderByPaidAtAsc(UUID salaryRecordId);

    List<SalaryPayment> findByPaidAtGreaterThanEqualAndPaidAtLessThanOrderByPaidAtDesc(Instant from, Instant to);
}
