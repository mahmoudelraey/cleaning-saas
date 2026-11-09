package com.fieldops.app.finance;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;
import com.fieldops.app.common.web.ApiException;

/**
 * One employee's salary for one month ({@code period} = first day of the month).
 *
 * <ul>
 *   <li>gross = base + allowances + overtime + bonus</li>
 *   <li>net (what the employee receives) = gross − deductions; payments are recorded against it</li>
 *   <li>cost to the company = gross + employer contributions (the figure the P&amp;L uses)</li>
 * </ul>
 */
@Entity
@Table(name = "salary_records")
public class SalaryRecord extends TenantScopedEntity {

    public enum Status {
        PENDING, PARTIALLY_PAID, PAID
    }

    @Column(name = "employee_id", nullable = false, updatable = false)
    private UUID employeeId;

    @Column(nullable = false, updatable = false)
    private LocalDate period;

    @Column(name = "base_halalas", nullable = false)
    private long baseHalalas;

    @Column(name = "allowances_halalas", nullable = false)
    private long allowancesHalalas;

    @Column(name = "overtime_halalas", nullable = false)
    private long overtimeHalalas;

    @Column(name = "bonus_halalas", nullable = false)
    private long bonusHalalas;

    @Column(name = "deductions_halalas", nullable = false)
    private long deductionsHalalas;

    @Column(name = "employer_cost_halalas", nullable = false)
    private long employerCostHalalas;

    @Column(name = "net_halalas", nullable = false)
    private long netHalalas;

    @Column(name = "paid_halalas", nullable = false)
    private long paidHalalas;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    private String notes;

    protected SalaryRecord() {
    }

    public SalaryRecord(UUID employeeId, LocalDate period) {
        this.employeeId = employeeId;
        this.period = period;
    }

    /** Sets the amounts; the net may not drop below what was already paid. */
    public void amounts(long base, long allowances, long overtime, long bonus, long deductions, long employerCost,
                        String notes) {
        if (base < 0 || allowances < 0 || overtime < 0 || bonus < 0 || deductions < 0 || employerCost < 0) {
            throw ApiException.badRequest("negative_amount", "Amounts cannot be negative");
        }
        long net = base + allowances + overtime + bonus - deductions;
        if (net < 0) {
            throw ApiException.badRequest("deductions_too_high", "Deductions cannot exceed the gross salary");
        }
        if (net < paidHalalas) {
            throw ApiException.conflict("net_below_paid", "The net salary cannot be less than what was already paid");
        }
        this.baseHalalas = base;
        this.allowancesHalalas = allowances;
        this.overtimeHalalas = overtime;
        this.bonusHalalas = bonus;
        this.deductionsHalalas = deductions;
        this.employerCostHalalas = employerCost;
        this.netHalalas = net;
        this.notes = notes;
        refreshStatus();
    }

    public void addPayment(long amount) {
        if (amount <= 0) {
            throw ApiException.badRequest("negative_amount", "The payment must be positive");
        }
        if (paidHalalas + amount > netHalalas) {
            throw ApiException.conflict("overpayment", "The payment is more than what is still due");
        }
        paidHalalas += amount;
        refreshStatus();
    }

    public void removePayment(long amount) {
        paidHalalas = Math.max(0, paidHalalas - amount);
        refreshStatus();
    }

    private void refreshStatus() {
        status = paidHalalas == 0 && netHalalas > 0 ? Status.PENDING
                : paidHalalas >= netHalalas ? Status.PAID
                : Status.PARTIALLY_PAID;
    }

    public long getGrossHalalas() {
        return baseHalalas + allowancesHalalas + overtimeHalalas + bonusHalalas;
    }

    public long getCostHalalas() {
        return getGrossHalalas() + employerCostHalalas;
    }

    public long getDueHalalas() {
        return netHalalas - paidHalalas;
    }

    public UUID getEmployeeId() {
        return employeeId;
    }

    public LocalDate getPeriod() {
        return period;
    }

    public long getBaseHalalas() {
        return baseHalalas;
    }

    public long getAllowancesHalalas() {
        return allowancesHalalas;
    }

    public long getOvertimeHalalas() {
        return overtimeHalalas;
    }

    public long getBonusHalalas() {
        return bonusHalalas;
    }

    public long getDeductionsHalalas() {
        return deductionsHalalas;
    }

    public long getEmployerCostHalalas() {
        return employerCostHalalas;
    }

    public long getNetHalalas() {
        return netHalalas;
    }

    public long getPaidHalalas() {
        return paidHalalas;
    }

    public Status getStatus() {
        return status;
    }

    public String getNotes() {
        return notes;
    }
}
