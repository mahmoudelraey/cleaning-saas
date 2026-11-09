package com.fieldops.app.finance;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

    @Query("""
            select e from Expense e
            where e.spentOn >= :from and e.spentOn <= :to
              and (:category is null or e.category = :category)
            order by e.spentOn desc, e.createdAt desc""")
    Page<Expense> search(@Param("from") LocalDate from, @Param("to") LocalDate to,
                         @Param("category") Expense.Category category, Pageable pageable);

    @Query("""
            select coalesce(sum(e.amountHalalas - e.vatHalalas), 0) from Expense e
            where e.spentOn >= :from and e.spentOn <= :to
              and (:category is null or e.category = :category)""")
    long sumCost(@Param("from") LocalDate from, @Param("to") LocalDate to,
                 @Param("category") Expense.Category category);
}
