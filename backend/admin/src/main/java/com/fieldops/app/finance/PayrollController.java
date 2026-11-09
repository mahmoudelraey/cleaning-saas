package com.fieldops.app.finance;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

import com.fieldops.app.finance.PayrollService.EmployeeData;
import com.fieldops.app.finance.PayrollService.EmployeeView;
import com.fieldops.app.finance.PayrollService.PaymentData;
import com.fieldops.app.finance.PayrollService.PaymentView;
import com.fieldops.app.finance.PayrollService.PeriodView;
import com.fieldops.app.finance.PayrollService.RecordData;
import com.fieldops.app.finance.PayrollService.RecordView;
import com.fieldops.app.finance.PayrollService.Totals;
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

/**
 * Employees, monthly salaries and salary payments. Owner only, with no screen an owner can hand to a
 * coordinator: salaries are the most sensitive data in the app. Periods are "yyyy-MM".
 */
@RestController
@RequestMapping("/api/v1/payroll")
@RequiresFeature(PlanFeature.REPORTS)
@PreAuthorize("hasRole('OWNER')")
public class PayrollController {

    private final PayrollService payroll;

    public PayrollController(PayrollService payroll) {
        this.payroll = payroll;
    }

    // --- employees

    @GetMapping("/employees")
    public List<EmployeeView> employees() {
        return payroll.employees();
    }

    @PostMapping("/employees")
    @ResponseStatus(HttpStatus.CREATED)
    public EmployeeView createEmployee(@RequestBody EmployeeData req) {
        return payroll.createEmployee(req);
    }

    @PutMapping("/employees/{id}")
    public EmployeeView updateEmployee(@PathVariable UUID id, @RequestBody EmployeeData req) {
        return payroll.updateEmployee(id, req);
    }

    @DeleteMapping("/employees/{id}")
    public ResponseEntity<Void> deleteEmployee(@PathVariable UUID id) {
        payroll.deleteEmployee(id);
        return ResponseEntity.noContent().build();
    }

    // --- monthly payroll

    @GetMapping("/periods/{period}")
    public PeriodView period(@PathVariable YearMonth period) {
        return payroll.period(period);
    }

    /** Creates the missing salary records of the month from each active employee's fixed pay. */
    @PostMapping("/periods/{period}/generate")
    public PeriodView generate(@PathVariable YearMonth period) {
        return payroll.generate(period);
    }

    /** Pays what is still due on every salary of the month. */
    @PostMapping("/periods/{period}/pay-all")
    public PeriodView payAll(@PathVariable YearMonth period, @RequestBody PayAllRequest req) {
        return payroll.payAll(period, req.method(), req.reference(), req.paidAt());
    }

    @PostMapping("/periods/{period}/records")
    @ResponseStatus(HttpStatus.CREATED)
    public RecordView addRecord(@PathVariable YearMonth period, @RequestBody AddRecordRequest req) {
        return payroll.addRecord(req.employeeId(), period, req.amounts());
    }

    @PutMapping("/records/{id}")
    public RecordView updateRecord(@PathVariable UUID id, @RequestBody RecordData req) {
        return payroll.updateRecord(id, req);
    }

    @DeleteMapping("/records/{id}")
    public ResponseEntity<Void> deleteRecord(@PathVariable UUID id) {
        payroll.deleteRecord(id);
        return ResponseEntity.noContent().build();
    }

    // --- payments

    @GetMapping("/records/{id}/payments")
    public List<PaymentView> payments(@PathVariable UUID id) {
        return payroll.paymentsOf(id);
    }

    @PostMapping("/records/{id}/payments")
    public RecordView pay(@PathVariable UUID id, @RequestBody PaymentData req) {
        return payroll.pay(id, req);
    }

    @DeleteMapping("/payments/{id}")
    public ResponseEntity<Void> deletePayment(@PathVariable UUID id) {
        payroll.deletePayment(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/pending")
    public List<RecordView> pending() {
        return payroll.pending();
    }

    @GetMapping("/payments")
    public List<PaymentView> history(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                     @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return payroll.history(from, to);
    }

    /** Twelve monthly totals of a year. */
    @GetMapping("/years/{year}")
    public List<Totals> year(@PathVariable int year) {
        return payroll.year(year);
    }

    public record PayAllRequest(com.fieldops.app.finance.SalaryPayment.Method method, String reference,
                                Instant paidAt) {
    }

    public record AddRecordRequest(UUID employeeId, RecordData amounts) {
    }
}
