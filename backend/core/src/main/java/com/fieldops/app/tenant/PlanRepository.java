package com.fieldops.app.tenant;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PlanRepository extends JpaRepository<Plan, String> {

    List<Plan> findByActiveTrueOrderByPriceMonthlyHalalasAsc();
}
