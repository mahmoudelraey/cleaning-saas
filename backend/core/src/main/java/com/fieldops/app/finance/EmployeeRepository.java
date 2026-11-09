package com.fieldops.app.finance;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface EmployeeRepository extends JpaRepository<Employee, UUID> {

    List<Employee> findAllByOrderByActiveDescNameAsc();

    List<Employee> findByActiveTrueOrderByNameAsc();

    Optional<Employee> findByUserId(UUID userId);
}
