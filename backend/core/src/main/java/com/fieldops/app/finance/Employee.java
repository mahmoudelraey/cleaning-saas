package com.fieldops.app.finance;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import com.fieldops.app.common.persistence.TenantScopedEntity;

/** Someone on the payroll; optionally linked to their app account (technician, coordinator). */
@Entity
@Table(name = "employees")
public class Employee extends TenantScopedEntity {

    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    private String name;

    @Column(name = "job_title")
    private String jobTitle;

    private String phone;

    @Column(name = "base_salary_halalas", nullable = false)
    private long baseSalaryHalalas;

    @Column(name = "housing_halalas", nullable = false)
    private long housingHalalas;

    @Column(name = "transport_halalas", nullable = false)
    private long transportHalalas;

    @Column(name = "other_allowances_halalas", nullable = false)
    private long otherAllowancesHalalas;

    /** Monthly employer contributions (GOSI employer share, insurance): a cost to the company, not pay. */
    @Column(name = "employer_cost_halalas", nullable = false)
    private long employerCostHalalas;

    @Column(name = "hire_date")
    private LocalDate hireDate;

    @Column(nullable = false)
    private boolean active = true;

    private String notes;

    protected Employee() {
    }

    public Employee(UUID userId, String name) {
        this.userId = userId;
        this.name = name;
    }

    public void update(UUID userId, String name, String jobTitle, String phone, long baseSalaryHalalas,
                       long housingHalalas, long transportHalalas, long otherAllowancesHalalas,
                       long employerCostHalalas, LocalDate hireDate, boolean active, String notes) {
        this.userId = userId;
        this.name = name;
        this.jobTitle = jobTitle;
        this.phone = phone;
        this.baseSalaryHalalas = baseSalaryHalalas;
        this.housingHalalas = housingHalalas;
        this.transportHalalas = transportHalalas;
        this.otherAllowancesHalalas = otherAllowancesHalalas;
        this.employerCostHalalas = employerCostHalalas;
        this.hireDate = hireDate;
        this.active = active;
        this.notes = notes;
    }

    /** Keeps the stored copy of a linked account's name and phone current (the account is the source). */
    public void syncContact(String name, String phone) {
        this.name = name;
        this.phone = phone;
    }

    /** Fixed allowances paid every month (housing + transport + other). */
    public long getAllowancesHalalas() {
        return housingHalalas + transportHalalas + otherAllowancesHalalas;
    }

    /** Fixed monthly gross pay (base + allowances). */
    public long getMonthlyGrossHalalas() {
        return baseSalaryHalalas + getAllowancesHalalas();
    }

    public UUID getUserId() {
        return userId;
    }

    public String getName() {
        return name;
    }

    public String getJobTitle() {
        return jobTitle;
    }

    public String getPhone() {
        return phone;
    }

    public long getBaseSalaryHalalas() {
        return baseSalaryHalalas;
    }

    public long getHousingHalalas() {
        return housingHalalas;
    }

    public long getTransportHalalas() {
        return transportHalalas;
    }

    public long getOtherAllowancesHalalas() {
        return otherAllowancesHalalas;
    }

    public long getEmployerCostHalalas() {
        return employerCostHalalas;
    }

    public LocalDate getHireDate() {
        return hireDate;
    }

    public boolean isActive() {
        return active;
    }

    public String getNotes() {
        return notes;
    }
}
