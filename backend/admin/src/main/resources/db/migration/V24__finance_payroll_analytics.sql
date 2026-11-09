-- Financial management (expenses, employees, monthly salaries and their payments) and the data the analytics
-- dashboards need for profitability. All money in halalas, like the rest of the schema.

-- 1. Direct cost per unit of a service (materials, consumables, subcontracting), set by the owner. NULL = unknown,
--    so profitability is only shown where the owner entered a cost (or tagged expenses to the service).
ALTER TABLE services ADD COLUMN cost_halalas BIGINT CHECK (cost_halalas >= 0);

-- 2. Employees on the payroll. Not every employee has an app account (drivers, helpers), so user_id is optional;
--    a technician or coordinator can be linked to their account.
CREATE TABLE employees (
    id                       UUID PRIMARY KEY,
    tenant_id                UUID         NOT NULL REFERENCES tenants (id),
    user_id                  UUID REFERENCES users (id) ON DELETE SET NULL,
    name                     VARCHAR(150) NOT NULL,
    job_title                VARCHAR(100),
    phone                    VARCHAR(20),
    base_salary_halalas      BIGINT       NOT NULL CHECK (base_salary_halalas >= 0),
    housing_halalas          BIGINT       NOT NULL DEFAULT 0 CHECK (housing_halalas >= 0),
    transport_halalas        BIGINT       NOT NULL DEFAULT 0 CHECK (transport_halalas >= 0),
    other_allowances_halalas BIGINT       NOT NULL DEFAULT 0 CHECK (other_allowances_halalas >= 0),
    -- Monthly employer contributions on top of pay (GOSI employer share, medical insurance...): a cost, not pay.
    employer_cost_halalas    BIGINT       NOT NULL DEFAULT 0 CHECK (employer_cost_halalas >= 0),
    hire_date                DATE,
    active                   BOOLEAN      NOT NULL DEFAULT TRUE,
    notes                    VARCHAR(1000),
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by               UUID
);
CREATE INDEX ix_employees_tenant ON employees (tenant_id, lower(name));
CREATE UNIQUE INDEX ux_employees_user ON employees (user_id) WHERE user_id IS NOT NULL;

-- 3. One salary record per employee per month (period = first day of the month).
--    gross = base + allowances + overtime + bonus; net (paid to the employee) = gross - deductions;
--    cost to the company = gross + employer contributions.
CREATE TABLE salary_records (
    id                     UUID PRIMARY KEY,
    tenant_id              UUID        NOT NULL REFERENCES tenants (id),
    employee_id            UUID        NOT NULL REFERENCES employees (id),
    period                 DATE        NOT NULL CHECK (EXTRACT(DAY FROM period) = 1),
    base_halalas           BIGINT      NOT NULL CHECK (base_halalas >= 0),
    allowances_halalas     BIGINT      NOT NULL DEFAULT 0 CHECK (allowances_halalas >= 0),
    overtime_halalas       BIGINT      NOT NULL DEFAULT 0 CHECK (overtime_halalas >= 0),
    bonus_halalas          BIGINT      NOT NULL DEFAULT 0 CHECK (bonus_halalas >= 0),
    deductions_halalas     BIGINT      NOT NULL DEFAULT 0 CHECK (deductions_halalas >= 0),
    employer_cost_halalas  BIGINT      NOT NULL DEFAULT 0 CHECK (employer_cost_halalas >= 0),
    net_halalas            BIGINT      NOT NULL CHECK (net_halalas >= 0),
    paid_halalas           BIGINT      NOT NULL DEFAULT 0 CHECK (paid_halalas >= 0),
    status                 VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'PARTIALLY_PAID', 'PAID')),
    notes                  VARCHAR(1000),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by             UUID,
    CONSTRAINT ux_salary_records_employee_period UNIQUE (employee_id, period),
    CONSTRAINT ck_salary_records_net CHECK (
        net_halalas = base_halalas + allowances_halalas + overtime_halalas + bonus_halalas - deductions_halalas),
    CONSTRAINT ck_salary_records_paid CHECK (paid_halalas <= net_halalas)
);
CREATE INDEX ix_salary_records_tenant_period ON salary_records (tenant_id, period);
CREATE INDEX ix_salary_records_pending ON salary_records (tenant_id, period) WHERE status <> 'PAID';

CREATE TABLE salary_payments (
    id               UUID PRIMARY KEY,
    tenant_id        UUID         NOT NULL REFERENCES tenants (id),
    salary_record_id UUID         NOT NULL REFERENCES salary_records (id) ON DELETE CASCADE,
    amount_halalas   BIGINT       NOT NULL CHECK (amount_halalas > 0),
    method           VARCHAR(20)  NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'OTHER')),
    reference        VARCHAR(100),
    paid_at          TIMESTAMPTZ  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by       UUID
);
CREATE INDEX ix_salary_payments_record ON salary_payments (salary_record_id);
CREATE INDEX ix_salary_payments_tenant_paid ON salary_payments (tenant_id, paid_at);

-- 4. Operating expenses other than salaries. amount = what was paid (VAT included); cost = amount - vat.
--    service_id optionally ties a direct cost to one service (counts toward that service's profitability).
CREATE TABLE expenses (
    id             UUID PRIMARY KEY,
    tenant_id      UUID         NOT NULL REFERENCES tenants (id),
    category       VARCHAR(30)  NOT NULL CHECK (category IN ('RENT', 'FUEL', 'TRANSPORT', 'SUPPLIES', 'EQUIPMENT',
                       'MAINTENANCE', 'MARKETING', 'UTILITIES', 'SOFTWARE', 'GOVERNMENT_FEES', 'INSURANCE', 'OTHER')),
    amount_halalas BIGINT       NOT NULL CHECK (amount_halalas > 0),
    vat_halalas    BIGINT       NOT NULL DEFAULT 0 CHECK (vat_halalas >= 0),
    spent_on       DATE         NOT NULL,
    description    VARCHAR(300) NOT NULL,
    vendor         VARCHAR(150),
    reference      VARCHAR(100),
    service_id     UUID REFERENCES services (id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by     UUID,
    CONSTRAINT ck_expenses_vat CHECK (vat_halalas <= amount_halalas)
);
CREATE INDEX ix_expenses_tenant_date ON expenses (tenant_id, spent_on);
CREATE INDEX ix_expenses_service ON expenses (service_id) WHERE service_id IS NOT NULL;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['employees', 'salary_records', 'salary_payments', 'expenses']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
            t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO fieldops_app', t);
    END LOOP;
END
$$;

-- 5. Indexes for the analytics joins (invoice -> booking -> items / address -> city -> region).
CREATE INDEX IF NOT EXISTS ix_booking_items_service ON booking_items (service_id);
CREATE INDEX IF NOT EXISTS ix_bookings_address ON bookings (address_id);
CREATE INDEX IF NOT EXISTS ix_addresses_city ON addresses (city_id);
CREATE INDEX IF NOT EXISTS ix_invoices_tenant_issued_live ON invoices (tenant_id, issued_at) WHERE status <> 'VOID';
