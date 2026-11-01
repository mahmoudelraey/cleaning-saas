-- Tenant-owned data. Every table carries tenant_id and is protected by Row Level Security
-- (second layer behind Hibernate @TenantId). The app sets app.tenant_id per transaction.

-- Helper: current tenant from the transaction setting; NULL (no rows) when unset.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS UUID
    LANGUAGE sql STABLE AS
$$
SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Customers ---------------------------------------------------------------
CREATE TABLE customers (
    id         UUID PRIMARY KEY,
    tenant_id  UUID         NOT NULL REFERENCES tenants (id),
    name       VARCHAR(150) NOT NULL,
    phone      VARCHAR(20)  NOT NULL,
    email      VARCHAR(200),
    notes      TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by UUID
);
CREATE UNIQUE INDEX ux_customers_tenant_phone ON customers (tenant_id, phone) WHERE deleted_at IS NULL;
CREATE INDEX ix_customers_tenant_name ON customers (tenant_id, lower(name));

CREATE TABLE addresses (
    id          UUID PRIMARY KEY,
    tenant_id   UUID         NOT NULL REFERENCES tenants (id),
    customer_id UUID         NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    label       VARCHAR(50)  NOT NULL,
    city        VARCHAR(80),
    district    VARCHAR(80),
    details     VARCHAR(500),
    lat         NUMERIC(9, 6),
    lng         NUMERIC(9, 6),
    map_url     VARCHAR(500),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by  UUID
);
CREATE INDEX ix_addresses_customer ON addresses (customer_id);

-- Catalog -----------------------------------------------------------------
CREATE TABLE services (
    id                  UUID PRIMARY KEY,
    tenant_id           UUID         NOT NULL REFERENCES tenants (id),
    name                VARCHAR(150) NOT NULL,
    description         VARCHAR(1000),
    pricing_type        VARCHAR(20)  NOT NULL CHECK (pricing_type IN ('FIXED', 'HOURLY', 'PER_SQM')),
    base_price_halalas  BIGINT       NOT NULL CHECK (base_price_halalas >= 0),
    duration_min        INTEGER      NOT NULL CHECK (duration_min > 0),
    active              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID
);
CREATE INDEX ix_services_tenant ON services (tenant_id);

CREATE TABLE service_addons (
    id            UUID PRIMARY KEY,
    tenant_id     UUID         NOT NULL REFERENCES tenants (id),
    service_id    UUID         NOT NULL REFERENCES services (id) ON DELETE CASCADE,
    name          VARCHAR(150) NOT NULL,
    price_halalas BIGINT       NOT NULL CHECK (price_halalas >= 0),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID
);
CREATE INDEX ix_service_addons_service ON service_addons (service_id);

-- Technicians -------------------------------------------------------------
CREATE TABLE technicians (
    id         UUID PRIMARY KEY,
    tenant_id  UUID        NOT NULL REFERENCES tenants (id),
    user_id    UUID        NOT NULL UNIQUE REFERENCES users (id),
    skills     JSONB       NOT NULL DEFAULT '[]'::jsonb,
    work_hours JSONB       NOT NULL DEFAULT '[]'::jsonb,
    color      VARCHAR(7)  NOT NULL DEFAULT '#0EA5A4',
    active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID
);
CREATE INDEX ix_technicians_tenant ON technicians (tenant_id);

-- Row Level Security --------------------------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['customers', 'addresses', 'services', 'service_addons', 'technicians']
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

GRANT EXECUTE ON FUNCTION app_current_tenant() TO fieldops_app;
