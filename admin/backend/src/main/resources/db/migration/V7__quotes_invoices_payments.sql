-- Week 6: quotes, invoices (gap-free numbering, VAT 15%, ZATCA phase-1 QR), payments, public share links,
-- company legal details and logo.

ALTER TABLE tenants
    ADD COLUMN address                 VARCHAR(300),
    ADD COLUMN commercial_registration VARCHAR(20),
    ADD COLUMN logo_key                VARCHAR(300),
    ADD COLUMN prices_include_vat      BOOLEAN NOT NULL DEFAULT FALSE;

-- Quotes ---------------------------------------------------------------------------------------------
CREATE TABLE quotes (
    id               UUID PRIMARY KEY,
    tenant_id        UUID          NOT NULL REFERENCES tenants (id),
    number           BIGINT        NOT NULL,
    booking_id       UUID REFERENCES bookings (id) ON DELETE SET NULL,
    customer_id      UUID          NOT NULL REFERENCES customers (id),
    customer_name    VARCHAR(150)  NOT NULL,
    customer_phone   VARCHAR(20)   NOT NULL,
    status           VARCHAR(20)   NOT NULL CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED')),
    valid_until      DATE          NOT NULL,
    prices_include_vat BOOLEAN     NOT NULL,
    vat_rate_bp      INTEGER       NOT NULL,
    lines_total_halalas BIGINT     NOT NULL,
    discount_halalas BIGINT        NOT NULL DEFAULT 0 CHECK (discount_halalas >= 0),
    taxable_halalas  BIGINT        NOT NULL,
    vat_halalas      BIGINT        NOT NULL,
    total_halalas    BIGINT        NOT NULL,
    notes            VARCHAR(2000),
    responded_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by       UUID,
    CONSTRAINT ux_quotes_tenant_number UNIQUE (tenant_id, number)
);
CREATE INDEX ix_quotes_tenant_created ON quotes (tenant_id, created_at DESC);

-- Invoices: immutable once issued (no drafts → numbers are assigned only to real invoices, no gaps).
CREATE TABLE invoices (
    id                  UUID PRIMARY KEY,
    tenant_id           UUID          NOT NULL REFERENCES tenants (id),
    number              BIGINT        NOT NULL,
    booking_id          UUID REFERENCES bookings (id) ON DELETE SET NULL,
    quote_id            UUID REFERENCES quotes (id) ON DELETE SET NULL,
    customer_id         UUID          NOT NULL REFERENCES customers (id),
    customer_name       VARCHAR(150)  NOT NULL,
    customer_phone      VARCHAR(20)   NOT NULL,
    customer_vat_number VARCHAR(20),
    seller_name         VARCHAR(150)  NOT NULL,
    seller_vat_number   VARCHAR(20),
    seller_address      VARCHAR(300),
    seller_cr           VARCHAR(20),
    issued_at           TIMESTAMPTZ   NOT NULL,
    due_date            DATE,
    status              VARCHAR(20)   NOT NULL CHECK (status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID')),
    prices_include_vat  BOOLEAN       NOT NULL,
    vat_rate_bp         INTEGER       NOT NULL,
    lines_total_halalas BIGINT        NOT NULL,
    discount_halalas    BIGINT        NOT NULL DEFAULT 0 CHECK (discount_halalas >= 0),
    taxable_halalas     BIGINT        NOT NULL,
    vat_halalas         BIGINT        NOT NULL,
    total_halalas       BIGINT        NOT NULL CHECK (total_halalas >= 0),
    paid_halalas        BIGINT        NOT NULL DEFAULT 0,
    notes               VARCHAR(2000),
    void_reason         VARCHAR(500),
    voided_at           TIMESTAMPTZ,
    zatca_uuid          UUID          NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by          UUID,
    CONSTRAINT ux_invoices_tenant_number UNIQUE (tenant_id, number)
);
CREATE INDEX ix_invoices_tenant_issued ON invoices (tenant_id, issued_at DESC);
CREATE INDEX ix_invoices_booking ON invoices (booking_id);
-- At most one live invoice per booking (a voided one can be re-issued).
CREATE UNIQUE INDEX ux_invoices_one_per_booking ON invoices (booking_id) WHERE booking_id IS NOT NULL AND status <> 'VOID';

CREATE TABLE document_lines (
    id                 UUID PRIMARY KEY,
    tenant_id          UUID           NOT NULL REFERENCES tenants (id),
    quote_id           UUID REFERENCES quotes (id) ON DELETE CASCADE,
    invoice_id         UUID REFERENCES invoices (id) ON DELETE CASCADE,
    position           INTEGER        NOT NULL,
    description        VARCHAR(300)   NOT NULL,
    quantity           NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    unit_price_halalas BIGINT         NOT NULL CHECK (unit_price_halalas >= 0),
    total_halalas      BIGINT         NOT NULL CHECK (total_halalas >= 0),
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    created_by         UUID,
    CONSTRAINT ck_document_lines_owner CHECK ((quote_id IS NULL) <> (invoice_id IS NULL))
);
CREATE INDEX ix_document_lines_quote ON document_lines (quote_id);
CREATE INDEX ix_document_lines_invoice ON document_lines (invoice_id);

CREATE TABLE payments (
    id             UUID PRIMARY KEY,
    tenant_id      UUID         NOT NULL REFERENCES tenants (id),
    invoice_id     UUID         NOT NULL REFERENCES invoices (id),
    method         VARCHAR(20)  NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'MADA', 'CARD', 'APPLE_PAY', 'ONLINE', 'OTHER')),
    amount_halalas BIGINT       NOT NULL CHECK (amount_halalas > 0),
    reference      VARCHAR(100),
    gateway_ref    VARCHAR(100),
    paid_at        TIMESTAMPTZ  NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by     UUID
);
CREATE INDEX ix_payments_invoice ON payments (invoice_id);
CREATE INDEX ix_payments_tenant_paid ON payments (tenant_id, paid_at);

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['quotes', 'invoices', 'document_lines', 'payments']
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

-- Unguessable share links (invoice/quote pages for the end customer). Global, like notification_refs,
-- because the public request has no tenant; the document itself is then loaded under that tenant's RLS.
CREATE TABLE public_links (
    token         VARCHAR(64) PRIMARY KEY,
    tenant_id     UUID        NOT NULL REFERENCES tenants (id),
    document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('INVOICE', 'QUOTE')),
    document_id   UUID        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_public_links_document ON public_links (document_type, document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public_links TO fieldops_app;
