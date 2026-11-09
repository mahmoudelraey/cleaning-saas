package com.fieldops.app.finance;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import com.fieldops.app.catalog.ServiceOfferingRepository;
import com.fieldops.app.common.web.ApiException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Operating expenses (everything but salaries, which come from payroll). */
@Service
public class ExpenseService {

    private final ExpenseRepository expenses;
    private final ServiceOfferingRepository services;

    public ExpenseService(ExpenseRepository expenses, ServiceOfferingRepository services) {
        this.expenses = expenses;
        this.services = services;
    }

    public record ExpenseData(Expense.Category category, long amountHalalas, long vatHalalas, LocalDate spentOn,
                              String description, String vendor, String reference, UUID serviceId) {
    }

    public record ExpensePage(Page<Expense> page, long totalCostHalalas) {
    }

    @Transactional(readOnly = true)
    public ExpensePage search(LocalDate from, LocalDate to, Expense.Category category, int page, int size) {
        if (from == null || to == null || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 3700) {
            throw ApiException.badRequest("invalid_range", "Choose a valid date range");
        }
        Page<Expense> p = expenses.search(from, to, category, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200)));
        return new ExpensePage(p, expenses.sumCost(from, to, category));
    }

    @Transactional
    public Expense create(ExpenseData d) {
        validate(d);
        return expenses.save(new Expense(d.category(), d.amountHalalas(), d.vatHalalas(), d.spentOn(),
                d.description().trim(), blankToNull(d.vendor()), blankToNull(d.reference()), d.serviceId()));
    }

    @Transactional
    public Expense update(UUID id, ExpenseData d) {
        validate(d);
        Expense e = expenses.findById(id).orElseThrow(() -> ApiException.notFound("expense"));
        e.update(d.category(), d.amountHalalas(), d.vatHalalas(), d.spentOn(), d.description().trim(),
                blankToNull(d.vendor()), blankToNull(d.reference()), d.serviceId());
        return e;
    }

    @Transactional
    public void delete(UUID id) {
        Expense e = expenses.findById(id).orElseThrow(() -> ApiException.notFound("expense"));
        expenses.delete(e);
    }

    private void validate(ExpenseData d) {
        if (d.category() == null || d.spentOn() == null || d.description() == null || d.description().isBlank()) {
            throw ApiException.badRequest("invalid_expense", "Category, date and description are required");
        }
        if (d.amountHalalas() <= 0 || d.vatHalalas() < 0 || d.vatHalalas() > d.amountHalalas()) {
            throw ApiException.badRequest("invalid_expense_amount", "Amount must be positive and VAT at most the amount");
        }
        if (d.spentOn().isAfter(LocalDate.now().plusDays(1))) {
            throw ApiException.badRequest("future_date", "The date cannot be in the future");
        }
        if (d.serviceId() != null && services.findById(d.serviceId()).isEmpty()) {
            throw ApiException.notFound("service");
        }
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
