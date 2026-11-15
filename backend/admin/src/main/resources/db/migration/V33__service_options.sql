-- Options (sub-services) of a service, each with its own price: e.g. "car wash" → small / medium / large car.
-- When a service has active options, every booking line for it must name one, and the option's price (and its
-- duration, when set) replaces the service's base price / duration. Configured by the company owner.
CREATE TABLE service_options (
    id            UUID PRIMARY KEY,
    tenant_id     UUID         NOT NULL REFERENCES tenants (id),
    service_id    UUID         NOT NULL REFERENCES services (id) ON DELETE CASCADE,
    name          VARCHAR(150) NOT NULL,
    name_en       VARCHAR(150),
    price_halalas BIGINT       NOT NULL CHECK (price_halalas >= 0),
    -- Minutes for one unit; NULL = the service's own duration.
    duration_min  INTEGER CHECK (duration_min BETWEEN 5 AND 1440),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Order shown to staff and customers (0 first).
    position      INTEGER      NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID
);
CREATE INDEX ix_service_options_service ON service_options (service_id);

ALTER TABLE service_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_options FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_options
    USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON service_options TO fieldops_app;

-- The option a booking line was priced with. Options that were booked are archived, never deleted.
ALTER TABLE booking_items ADD COLUMN option_id UUID REFERENCES service_options (id);
CREATE INDEX ix_booking_items_option ON booking_items (option_id) WHERE option_id IS NOT NULL;

-- Same for quote / invoice lines (no foreign key, like service_id / addon_id in V32).
ALTER TABLE document_lines ADD COLUMN option_id UUID;
