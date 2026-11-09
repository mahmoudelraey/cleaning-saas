package com.fieldops.app.finance;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SalaryRecordRepository extends JpaRepository<SalaryRecord, UUID> {

    List<SalaryRecord> findByPeriod(LocalDate period);

    boolean existsByEmployeeIdAndPeriod(UUID employeeId, LocalDate period);

    boolean existsByEmployeeId(UUID employeeId);

    List<SalaryRecord> findByStatusNotOrderByPeriodAsc(SalaryRecord.Status status);

    List<SalaryRecord> findByPeriodBetweenOrderByPeriodAsc(LocalDate from, LocalDate to);
}
