package com.fieldops.app.finance;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.fieldops.app.auth.User;
import com.fieldops.app.auth.UserRepository;
import com.fieldops.app.common.security.Role;
import com.fieldops.app.common.tenant.TenantContext;
import com.fieldops.app.common.web.ApiException;
import com.fieldops.app.tenant.TenantService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Employees, monthly salary records and salary payments. Owner-only data (enforced by the controller); every
 * amount is in halalas. A month's payroll is generated from each active employee's fixed pay and can then be
 * adjusted (overtime, bonus, deductions) until it is paid.
 */
@Service
public class PayrollService {

    private final EmployeeRepository employees;
    private final SalaryRecordRepository records;
    private final SalaryPaymentRepository payments;
    private final UserRepository users;
    private final TenantService tenants;

    public PayrollService(EmployeeRepository employees, SalaryRecordRepository records,
                          SalaryPaymentRepository payments, UserRepository users, TenantService tenants) {
        this.employees = employees;
        this.records = records;
        this.payments = payments;
        this.users = users;
        this.tenants = tenants;
    }

    // --- DTOs -------------------------------------------------------------------------------------

    public record EmployeeData(UUID userId, String name, String jobTitle, String phone, long baseSalaryHalalas,
                               long housingHalalas, long transportHalalas, long otherAllowancesHalalas,
                               long employerCostHalalas, LocalDate hireDate, boolean active, String notes) {
    }

    /**
     * A payroll row. Team members (technicians, coordinators) appear even before their salary is set: then
     * {@code id} is null and {@code salarySet} false. For anyone linked to an app account, name and phone come
     * from the account, so they are edited in one place (Team / Technicians).
     *
     * @param role          the linked account's role, or null for staff without an app account
     * @param accountActive whether the linked account can still sign in
     */
    public record EmployeeView(UUID id, UUID userId, Role role, boolean accountActive, boolean salarySet, String name,
                               String jobTitle, String phone, long baseSalaryHalalas, long housingHalalas,
                               long transportHalalas, long otherAllowancesHalalas, long employerCostHalalas,
                               long monthlyGrossHalalas, long monthlyCostHalalas, LocalDate hireDate, boolean active,
                               String notes) {
    }

    public record RecordData(long baseHalalas, long allowancesHalalas, long overtimeHalalas, long bonusHalalas,
                             long deductionsHalalas, long employerCostHalalas, String notes) {
    }

    public record RecordView(UUID id, UUID employeeId, String employeeName, String jobTitle, String period,
                             long baseHalalas, long allowancesHalalas, long overtimeHalalas, long bonusHalalas,
                             long deductionsHalalas, long employerCostHalalas, long grossHalalas, long netHalalas,
                             long paidHalalas, long dueHalalas, long costHalalas, SalaryRecord.Status status,
                             String notes) {
    }

    public record Totals(int employees, int paid, long grossHalalas, long netHalalas, long paidHalalas,
                         long dueHalalas, long costHalalas) {
    }

    public record PeriodView(String period, List<RecordView> records, Totals totals, int missing) {
    }

    public record PaymentData(long amountHalalas, SalaryPayment.Method method, String reference, Instant paidAt) {
    }

    public record PaymentView(UUID id, UUID recordId, UUID employeeId, String employeeName, String period,
                              long amountHalalas, SalaryPayment.Method method, String reference, Instant paidAt) {
    }

    // --- employees --------------------------------------------------------------------------------

    /**
     * Everyone on the payroll plus every active technician and coordinator whose salary is not set yet, so team
     * members never have to be entered twice. Active first, then by name.
     */
    @Transactional(readOnly = true)
    public List<EmployeeView> employees() {
        Map<UUID, User> staff = staff();
        List<EmployeeView> out = new ArrayList<>();
        Set<UUID> linked = new HashSet<>();
        for (Employee e : employees.findAllByOrderByActiveDescNameAsc()) {
            if (e.getUserId() != null) {
                linked.add(e.getUserId());
            }
            out.add(view(e, staff));
        }
        for (User u : staff.values()) {
            if (u.getRole() != Role.OWNER && u.isActive() && !linked.contains(u.getId())) {
                out.add(new EmployeeView(null, u.getId(), u.getRole(), true, false, u.getName(), null, u.getPhone(),
                        0, 0, 0, 0, 0, 0, 0, null, true, null));
            }
        }
        out.sort(Comparator.comparing((EmployeeView v) -> !v.active())
                .thenComparing(EmployeeView::name, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    /** Sets up pay for a team member (userId given: name and phone come from the account) or adds non-app staff. */
    @Transactional
    public EmployeeView createEmployee(EmployeeData d) {
        User user = validate(d, null);
        Employee e = new Employee(d.userId(), user != null ? user.getName() : d.name().trim());
        apply(e, d, user);
        return view(save(e), staff());
    }

    @Transactional
    public EmployeeView updateEmployee(UUID id, EmployeeData d) {
        Employee e = employee(id);
        User user = validate(d, id);
        apply(e, d, user);
        return view(save(e), staff());
    }

    @Transactional
    public void deleteEmployee(UUID id) {
        Employee e = employee(id);
        if (records.existsByEmployeeId(id)) {
            throw ApiException.conflict("employee_has_salaries",
                    "This employee has salary records; mark them inactive instead");
        }
        employees.delete(e);
    }

    // --- monthly payroll --------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public PeriodView period(YearMonth month) {
        LocalDate period = month.atDay(1);
        Lookup byId = lookup();
        List<SalaryRecord> list = records.findByPeriod(period);
        long missing = eligible(month).stream()
                .filter(e -> list.stream().noneMatch(r -> r.getEmployeeId().equals(e.getId()))).count();
        List<RecordView> views = list.stream().map(r -> view(r, byId))
                .sorted(Comparator.comparing(RecordView::employeeName, String.CASE_INSENSITIVE_ORDER)).toList();
        return new PeriodView(month.toString(), views, totals(views), (int) missing);
    }

    /** Creates the month's record for every active employee (hired by then) that does not have one yet. */
    @Transactional
    public PeriodView generate(YearMonth month) {
        LocalDate period = month.atDay(1);
        Map<UUID, User> staff = staff();
        for (Employee e : eligible(month)) {
            User u = e.getUserId() == null ? null : staff.get(e.getUserId());
            if (u != null) {
                e.syncContact(u.getName(), u.getPhone());
            }
            if (!records.existsByEmployeeIdAndPeriod(e.getId(), period)) {
                SalaryRecord r = new SalaryRecord(e.getId(), period);
                r.amounts(e.getBaseSalaryHalalas(), e.getAllowancesHalalas(), 0, 0, 0, e.getEmployerCostHalalas(), null);
                records.save(r);
            }
        }
        records.flush();
        return period(month);
    }

    /** Adds one employee's record for a month (e.g. someone who left mid-month and is now inactive). */
    @Transactional
    public RecordView addRecord(UUID employeeId, YearMonth month, RecordData d) {
        Employee e = employee(employeeId);
        LocalDate period = month.atDay(1);
        if (records.existsByEmployeeIdAndPeriod(employeeId, period)) {
            throw ApiException.conflict("salary_exists", "This employee already has a salary for that month");
        }
        SalaryRecord r = new SalaryRecord(e.getId(), period);
        r.amounts(d.baseHalalas(), d.allowancesHalalas(), d.overtimeHalalas(), d.bonusHalalas(),
                d.deductionsHalalas(), d.employerCostHalalas(), blankToNull(d.notes()));
        return view(records.save(r), lookup());
    }

    @Transactional
    public RecordView updateRecord(UUID id, RecordData d) {
        SalaryRecord r = record(id);
        r.amounts(d.baseHalalas(), d.allowancesHalalas(), d.overtimeHalalas(), d.bonusHalalas(),
                d.deductionsHalalas(), d.employerCostHalalas(), blankToNull(d.notes()));
        return view(r, lookup());
    }

    @Transactional
    public void deleteRecord(UUID id) {
        SalaryRecord r = record(id);
        if (r.getPaidHalalas() > 0) {
            throw ApiException.conflict("salary_has_payments", "Remove the payments first");
        }
        records.delete(r);
    }

    // --- payments ---------------------------------------------------------------------------------

    @Transactional
    public RecordView pay(UUID recordId, PaymentData d) {
        SalaryRecord r = record(recordId);
        if (d.method() == null) {
            throw ApiException.badRequest("invalid_method", "Choose a payment method");
        }
        Instant paidAt = paidAt(d.paidAt());
        r.addPayment(d.amountHalalas());
        payments.save(new SalaryPayment(r.getId(), d.amountHalalas(), d.method(), blankToNull(d.reference()), paidAt));
        return view(r, lookup());
    }

    /** Pays what is still due on every record of the month in one go (e.g. the monthly bank transfer run). */
    @Transactional
    public PeriodView payAll(YearMonth month, SalaryPayment.Method method, String reference, Instant when) {
        if (method == null) {
            throw ApiException.badRequest("invalid_method", "Choose a payment method");
        }
        Instant paidAt = paidAt(when);
        for (SalaryRecord r : records.findByPeriod(month.atDay(1))) {
            long due = r.getDueHalalas();
            if (due > 0) {
                r.addPayment(due);
                payments.save(new SalaryPayment(r.getId(), due, method, blankToNull(reference), paidAt));
            }
        }
        return period(month);
    }

    @Transactional
    public void deletePayment(UUID paymentId) {
        SalaryPayment p = payments.findById(paymentId).orElseThrow(() -> ApiException.notFound("salary_payment"));
        record(p.getSalaryRecordId()).removePayment(p.getAmountHalalas());
        payments.delete(p);
    }

    @Transactional(readOnly = true)
    public List<PaymentView> paymentsOf(UUID recordId) {
        SalaryRecord r = record(recordId);
        Lookup byId = lookup();
        return payments.findBySalaryRecordIdOrderByPaidAtAsc(recordId).stream()
                .map(p -> view(p, r, byId)).toList();
    }

    /** Payment history between two days (inclusive, company time zone). */
    @Transactional(readOnly = true)
    public List<PaymentView> history(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw ApiException.badRequest("invalid_range", "Choose a valid date range");
        }
        ZoneId zone = ZoneId.of(tenants.current().getTimezone());
        List<SalaryPayment> list = payments.findByPaidAtGreaterThanEqualAndPaidAtLessThanOrderByPaidAtDesc(
                from.atStartOfDay(zone).toInstant(), to.plusDays(1).atStartOfDay(zone).toInstant());
        Map<UUID, SalaryRecord> recordsById = records.findAllById(
                list.stream().map(SalaryPayment::getSalaryRecordId).distinct().toList()).stream()
                .collect(Collectors.toMap(SalaryRecord::getId, Function.identity()));
        Lookup byId = lookup();
        return list.stream().map(p -> view(p, recordsById.get(p.getSalaryRecordId()), byId)).toList();
    }

    /** Every salary not fully paid yet, oldest month first. */
    @Transactional(readOnly = true)
    public List<RecordView> pending() {
        Lookup byId = lookup();
        return records.findByStatusNotOrderByPeriodAsc(SalaryRecord.Status.PAID).stream().map(r -> view(r, byId)).toList();
    }

    /** Twelve months of payroll totals for a year (zero-filled). */
    @Transactional(readOnly = true)
    public List<Totals> year(int year) {
        List<SalaryRecord> list = records.findByPeriodBetweenOrderByPeriodAsc(LocalDate.of(year, 1, 1),
                LocalDate.of(year, 12, 1));
        Lookup byId = lookup();
        List<Totals> out = new ArrayList<>();
        for (int m = 1; m <= 12; m++) {
            LocalDate p = LocalDate.of(year, m, 1);
            out.add(totals(list.stream().filter(r -> r.getPeriod().equals(p)).map(r -> view(r, byId)).toList()));
        }
        return out;
    }

    // ---------------------------------------------------------------------------------------------

    private List<Employee> eligible(YearMonth month) {
        LocalDate end = month.atEndOfMonth();
        return employees.findByActiveTrueOrderByNameAsc().stream()
                .filter(e -> e.getHireDate() == null || !e.getHireDate().isAfter(end)).toList();
    }

    /** @return the linked account, or null for staff without one */
    private User validate(EmployeeData d, UUID self) {
        if (d.userId() == null && (d.name() == null || d.name().isBlank())) {
            throw ApiException.badRequest("invalid_name", "Enter the employee's name");
        }
        if (d.baseSalaryHalalas() < 0 || d.housingHalalas() < 0 || d.transportHalalas() < 0
                || d.otherAllowancesHalalas() < 0 || d.employerCostHalalas() < 0) {
            throw ApiException.badRequest("negative_amount", "Amounts cannot be negative");
        }
        if (d.userId() == null) {
            return null;
        }
        User user = users.findByIdAndTenantId(d.userId(), TenantContext.require())
                .orElseThrow(() -> ApiException.notFound("user"));
        employees.findByUserId(d.userId()).filter(o -> !o.getId().equals(self)).ifPresent(o -> {
            throw ApiException.conflict("user_already_employee", "This account is already linked to an employee");
        });
        return user;
    }

    /** Name and phone of a linked employee always come from the account. */
    private static void apply(Employee e, EmployeeData d, User user) {
        e.update(d.userId(), user != null ? user.getName() : d.name().trim(), blankToNull(d.jobTitle()),
                user != null ? user.getPhone() : blankToNull(d.phone()),
                d.baseSalaryHalalas(), d.housingHalalas(), d.transportHalalas(), d.otherAllowancesHalalas(),
                d.employerCostHalalas(), d.hireDate(), d.active(), blankToNull(d.notes()));
    }

    private Employee save(Employee e) {
        try {
            return employees.saveAndFlush(e);
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.conflict("user_already_employee", "This account is already linked to an employee");
        }
    }

    private Instant paidAt(Instant when) {
        Instant paidAt = when == null ? Instant.now() : when;
        if (paidAt.isAfter(Instant.now().plusSeconds(86_400))) {
            throw ApiException.badRequest("future_date", "The payment date cannot be in the future");
        }
        return paidAt;
    }

    private Employee employee(UUID id) {
        return employees.findById(id).orElseThrow(() -> ApiException.notFound("employee"));
    }

    private SalaryRecord record(UUID id) {
        return records.findById(id).orElseThrow(() -> ApiException.notFound("salary_record"));
    }

    /** Employees by id, with the accounts that give linked employees their current name. */
    private record Lookup(Map<UUID, Employee> byId, Map<UUID, User> users) {
        Employee employee(UUID id) {
            return byId.get(id);
        }

        String name(Employee e) {
            return displayName(e, users);
        }
    }

    private Lookup lookup() {
        return new Lookup(employees.findAll().stream().collect(Collectors.toMap(Employee::getId, Function.identity())),
                staff());
    }

    /** Every account of the company, by id. */
    private Map<UUID, User> staff() {
        Map<UUID, User> out = new LinkedHashMap<>();
        users.findByTenantIdOrderByNameAsc(TenantContext.require()).forEach(u -> out.put(u.getId(), u));
        return out;
    }

    private static String displayName(Employee e, Map<UUID, User> users) {
        User u = e.getUserId() == null ? null : users.get(e.getUserId());
        return u != null ? u.getName() : e.getName();
    }

    private static EmployeeView view(Employee e, Map<UUID, User> users) {
        User u = e.getUserId() == null ? null : users.get(e.getUserId());
        return new EmployeeView(e.getId(), e.getUserId(), u == null ? null : u.getRole(), u == null || u.isActive(),
                true, displayName(e, users), e.getJobTitle(), u != null ? u.getPhone() : e.getPhone(),
                e.getBaseSalaryHalalas(), e.getHousingHalalas(),
                e.getTransportHalalas(), e.getOtherAllowancesHalalas(), e.getEmployerCostHalalas(),
                e.getMonthlyGrossHalalas(), e.getMonthlyGrossHalalas() + e.getEmployerCostHalalas(), e.getHireDate(),
                e.isActive(), e.getNotes());
    }

    private static RecordView view(SalaryRecord r, Lookup byId) {
        Employee e = byId.employee(r.getEmployeeId());
        return new RecordView(r.getId(), r.getEmployeeId(), e == null ? "" : byId.name(e),
                e == null ? null : e.getJobTitle(), YearMonth.from(r.getPeriod()).toString(), r.getBaseHalalas(),
                r.getAllowancesHalalas(), r.getOvertimeHalalas(), r.getBonusHalalas(), r.getDeductionsHalalas(),
                r.getEmployerCostHalalas(), r.getGrossHalalas(), r.getNetHalalas(), r.getPaidHalalas(),
                r.getDueHalalas(), r.getCostHalalas(), r.getStatus(), r.getNotes());
    }

    private static PaymentView view(SalaryPayment p, SalaryRecord r, Lookup byId) {
        Employee e = r == null ? null : byId.employee(r.getEmployeeId());
        return new PaymentView(p.getId(), p.getSalaryRecordId(), r == null ? null : r.getEmployeeId(),
                e == null ? "" : byId.name(e), r == null ? null : YearMonth.from(r.getPeriod()).toString(),
                p.getAmountHalalas(), p.getMethod(), p.getReference(), p.getPaidAt());
    }

    private static Totals totals(List<RecordView> list) {
        return new Totals(list.size(), (int) list.stream().filter(r -> r.status() == SalaryRecord.Status.PAID).count(),
                list.stream().mapToLong(RecordView::grossHalalas).sum(),
                list.stream().mapToLong(RecordView::netHalalas).sum(),
                list.stream().mapToLong(RecordView::paidHalalas).sum(),
                list.stream().mapToLong(RecordView::dueHalalas).sum(),
                list.stream().mapToLong(RecordView::costHalalas).sum());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
