package com.fieldops.app.finance;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.tenant.PlanFeature;
import com.fieldops.app.tenant.RequiresFeature;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Operating expenses. Owners, and coordinators the owner gave the Expenses screen (ScreenAccessInterceptor). */
@RestController
@RequestMapping("/api/v1/expenses")
@RequiresFeature(PlanFeature.REPORTS)
@PreAuthorize("hasAnyRole('OWNER','COORDINATOR')")
public class ExpenseController {

    private final ExpenseService expenses;

    public ExpenseController(ExpenseService expenses) {
        this.expenses = expenses;
    }

    @GetMapping
    public ExpenseList list(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                            @RequestParam(required = false) Expense.Category category,
                            @RequestParam(defaultValue = "0") int page,
                            @RequestParam(defaultValue = "50") int size) {
        ExpenseService.ExpensePage p = expenses.search(from, to, category, page, size);
        return new ExpenseList(p.page().getContent().stream().map(ExpenseController::dto).toList(),
                p.page().getNumber(), p.page().getSize(), p.page().getTotalElements(), p.totalCostHalalas());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ExpenseDto create(@RequestBody ExpenseService.ExpenseData req) {
        return dto(expenses.create(req));
    }

    @PutMapping("/{id}")
    public ExpenseDto update(@PathVariable UUID id, @RequestBody ExpenseService.ExpenseData req) {
        return dto(expenses.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        expenses.delete(id);
        return ResponseEntity.noContent().build();
    }

    public record ExpenseDto(UUID id, Expense.Category category, long amountHalalas, long vatHalalas,
                             long costHalalas, LocalDate spentOn, String description, String vendor,
                             String reference, UUID serviceId, Instant createdAt) {
    }

    public record ExpenseList(List<ExpenseDto> items, int page, int size, long total, long totalCostHalalas) {
    }

    private static ExpenseDto dto(Expense e) {
        return new ExpenseDto(e.getId(), e.getCategory(), e.getAmountHalalas(), e.getVatHalalas(), e.getCostHalalas(),
                e.getSpentOn(), e.getDescription(), e.getVendor(), e.getReference(), e.getServiceId(),
                e.getCreatedAt());
    }
}
