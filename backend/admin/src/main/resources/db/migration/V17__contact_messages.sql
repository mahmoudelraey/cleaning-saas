-- "Contact us" messages sent from the customer portal, handled by the office in the admin app.
CREATE TABLE contact_messages (
    id          UUID PRIMARY KEY,
    tenant_id   UUID          NOT NULL REFERENCES tenants (id),
    -- Set when a signed-in customer sent it.
    customer_id UUID REFERENCES customers (id) ON DELETE SET NULL,
    name        VARCHAR(150)  NOT NULL,
    phone       VARCHAR(20)   NOT NULL,
    email       VARCHAR(200),
    topic       VARCHAR(20)   NOT NULL CHECK (topic IN ('BOOKING', 'QUESTION', 'QUOTE', 'COMPLAINT', 'OTHER')),
    message     VARCHAR(2000) NOT NULL,
    status      VARCHAR(20)   NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'DONE')),
    handled_by  UUID,
    handled_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by  UUID
);
CREATE INDEX ix_contact_messages_tenant_status ON contact_messages (tenant_id, status, created_at DESC);
CREATE INDEX ix_contact_messages_tenant_phone ON contact_messages (tenant_id, phone, created_at DESC);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contact_messages
    USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_messages TO fieldops_app;
