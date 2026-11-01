package com.fieldops.app.scheduling;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import com.fieldops.app.auth.User;
import com.fieldops.app.common.persistence.TenantScopedEntity;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Scheduling profile of a field technician; login identity lives in {@link User}. */
@Entity
@Table(name = "technicians")
public class Technician extends TenantScopedEntity {

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, updatable = false, unique = true)
    private User user;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "skills", nullable = false)
    private List<String> skills = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "work_hours", nullable = false)
    private List<WorkShift> workHours = new ArrayList<>();

    /** Calendar colour, #RRGGBB. */
    @Column(nullable = false)
    private String color;

    @Column(nullable = false)
    private boolean active = true;

    protected Technician() {
    }

    public Technician(User user, List<String> skills, List<WorkShift> workHours, String color) {
        this.user = user;
        update(skills, workHours, color);
    }

    public void update(List<String> skills, List<WorkShift> workHours, String color) {
        this.skills = new ArrayList<>(skills);
        this.workHours = new ArrayList<>(workHours);
        this.color = color;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public User getUser() {
        return user;
    }

    public List<String> getSkills() {
        return skills;
    }

    public List<WorkShift> getWorkHours() {
        return workHours;
    }

    public String getColor() {
        return color;
    }

    public boolean isActive() {
        return active;
    }
}
