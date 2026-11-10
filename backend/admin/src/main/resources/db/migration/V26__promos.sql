-- Promotions: discount codes the office creates in the admin app. A promo can also be announced on the
-- company's public page; customers enter its code while booking and the discount is kept on the booking
-- (and carried to its invoice, whose discount_halalas column already exists since V7).

CREATE TABLE promos (
    id                   UUID PRIMARY KEY,
    tenant_id            UUID         NOT NULL REFERENCES tenants (id),
    -- What the customer types, stored upper-case (A-Z, 0-9, dash).
    code                 VARCHAR(30)  NOT NULL CHECK (code ~ '^[A-Z0-9-]{3,30}$'),
    -- Short text for the announcement bar and the booking summary (Arabic; English optional).
    title                VARCHAR(150) NOT NULL,
    title_en             VARCHAR(150),
    discount_type        VARCHAR(10)  NOT NULL CHECK (discount_type IN ('PERCENT', 'AMOUNT')),
    -- PERCENT: 1-100. AMOUNT: halalas off the booking.
    discount_value       BIGINT       NOT NULL CHECK (discount_value > 0),
    -- PERCENT only: cap on the discount, in halalas.
    max_discount_halalas BIGINT CHECK (max_discount_halalas > 0),
    -- The booking's subtotal must reach this, in halalas.
    min_subtotal_halalas BIGINT       NOT NULL DEFAULT 0 CHECK (min_subtotal_halalas >= 0),
    starts_at            TIMESTAMPTZ,
    ends_at              TIMESTAMPTZ,
    -- How many bookings may use it in total, and per customer (NULL = no limit).
    usage_limit          INTEGER CHECK (usage_limit > 0),
    per_customer_limit   INTEGER CHECK (per_customer_limit > 0),
    -- Only for a customer's first booking with the company.
    first_booking_only   BOOLEAN      NOT NULL DEFAULT FALSE,
    active               BOOLEAN      NOT NULL DEFAULT TRUE,
    -- Shown as the announcement bar on the public page while it is valid.
    announce             BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by           UUID,
    CONSTRAINT ck_promos_percent CHECK (discount_type <> 'PERCENT' OR discount_value <= 100),
    CONSTRAINT ck_promos_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
    CONSTRAINT ux_promos_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX ix_promos_tenant_created ON promos (tenant_id, created_at DESC);
CREATE INDEX ix_promos_tenant_announce ON promos (tenant_id) WHERE announce AND active;

ALTER TABLE promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE promos FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON promos
    USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON promos TO fieldops_app;

-- The promo a booking was made with. The code and the discount are kept as they were at booking time,
-- even if the promo is edited or deleted later. Usage is counted from these rows (cancelled ones excluded).
ALTER TABLE bookings
    ADD COLUMN promo_id         UUID REFERENCES promos (id) ON DELETE SET NULL,
    ADD COLUMN promo_code       VARCHAR(30),
    ADD COLUMN discount_halalas BIGINT NOT NULL DEFAULT 0 CHECK (discount_halalas >= 0);
CREATE INDEX ix_bookings_promo ON bookings (promo_id) WHERE promo_id IS NOT NULL;
