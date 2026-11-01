-- Week 3: bookings, their items, technician assignments, and the visit event log.
-- Same conventions: tenant_id + RLS on every table, money in halalas, timestamps in UTC.

-- Per-tenant gap-free counters (booking numbers now, invoice numbers in week 6).
CREATE TABLE tenant_counters (
    tenant_id  UUID        NOT NULL REFERENCES tenants (id),
    name       VARCHAR(30) NOT NULL,
    next_value BIGINT      NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, name)
);

CREATE TABLE bookings (
    id                UUID PRIMARY KEY,
    tenant_id         UUID         NOT NULL REFERENCES tenants (id),
    number            BIGINT       NOT NULL,
    customer_id       UUID         NOT NULL REFERENCES customers (id),
    -- Snapshots: what the booking was made with, even if the customer record changes later.
    customer_name     VARCHAR(150) NOT NULL,
    customer_phone    VARCHAR(20)  NOT NULL,
    address_id        UUID REFERENCES addresses (id) ON DELETE SET NULL,
    address_text      VARCHAR(700),
    address_lat       NUMERIC(9, 6),
    address_lng       NUMERIC(9, 6),
    address_map_url   VARCHAR(500),
    status            VARCHAR(20)  NOT NULL CHECK (status IN
                          ('NEW', 'CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    source            VARCHAR(20)  NOT NULL CHECK (source IN ('MANUAL', 'PUBLIC_PAGE')),
    scheduled_start   TIMESTAMPTZ  NOT NULL,
    scheduled_end     TIMESTAMPTZ  NOT NULL,
    subtotal_halalas  BIGINT       NOT NULL CHECK (subtotal_halalas >= 0),
    notes             VARCHAR(2000),
    internal_notes    VARCHAR(2000),
    cancel_reason     VARCHAR(500),
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by        UUID,
    CONSTRAINT ck_bookings_time CHECK (scheduled_end > scheduled_start),
    CONSTRAINT ux_bookings_tenant_number UNIQUE (tenant_id, number)
);
CREATE INDEX ix_bookings_tenant_start ON bookings (tenant_id, scheduled_start);
CREATE INDEX ix_bookings_tenant_status ON bookings (tenant_id, status);
CREATE INDEX ix_bookings_customer ON bookings (customer_id);

CREATE TABLE booking_items (
    id                 UUID PRIMARY KEY,
    tenant_id          UUID          NOT NULL REFERENCES tenants (id),
    booking_id         UUID          NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    service_id         UUID          NOT NULL REFERENCES services (id),
    addon_id           UUID REFERENCES service_addons (id),
    description        VARCHAR(300)  NOT NULL,
    quantity           NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    unit_price_halalas BIGINT        NOT NULL CHECK (unit_price_halalas >= 0),
    total_halalas      BIGINT        NOT NULL CHECK (total_halalas >= 0),
    position           INTEGER       NOT NULL,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by         UUID
);
CREATE INDEX ix_booking_items_booking ON booking_items (booking_id);

-- A technician can never be in two places at once: enforced by the database, not only by code.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE assignments (
    id            UUID PRIMARY KEY,
    tenant_id     UUID        NOT NULL REFERENCES tenants (id),
    booking_id    UUID        NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    technician_id UUID        NOT NULL REFERENCES technicians (id),
    starts_at     TIMESTAMPTZ NOT NULL,
    ends_at       TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    CONSTRAINT ck_assignments_time CHECK (ends_at > starts_at),
    CONSTRAINT ux_assignments_booking_tech UNIQUE (booking_id, technician_id),
    CONSTRAINT ex_assignments_no_overlap EXCLUDE USING gist (
        technician_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
    )
);
CREATE INDEX ix_assignments_tenant_time ON assignments (tenant_id, starts_at);

CREATE TABLE visit_events (
    id          UUID PRIMARY KEY,
    tenant_id   UUID         NOT NULL REFERENCES tenants (id),
    booking_id  UUID         NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    type        VARCHAR(30)  NOT NULL,
    from_status VARCHAR(20),
    to_status   VARCHAR(20),
    note        VARCHAR(1000),
    actor_name  VARCHAR(150),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by  UUID
);
CREATE INDEX ix_visit_events_booking ON visit_events (booking_id, created_at);

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['tenant_counters', 'bookings', 'booking_items', 'assignments', 'visit_events']
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
