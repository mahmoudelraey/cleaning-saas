-- Week 7: public booking page (/book/{slug}) with phone verification by one-time code.

ALTER TABLE tenants
    ADD COLUMN booking_page_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN booking_page_note    VARCHAR(500);

-- One row per code sent. Only hashes are stored (code and session token). A verified code turns into a
-- short-lived booking session that can be used once.
CREATE TABLE otp_codes (
    id                 UUID PRIMARY KEY,
    tenant_id          UUID        NOT NULL REFERENCES tenants (id),
    phone              VARCHAR(20) NOT NULL,
    code_hash          VARCHAR(64) NOT NULL,
    expires_at         TIMESTAMPTZ NOT NULL,
    attempts           INTEGER     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    verified_at        TIMESTAMPTZ,
    session_hash       VARCHAR(64),
    session_expires_at TIMESTAMPTZ,
    used_at            TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         UUID
);
CREATE INDEX ix_otp_codes_phone ON otp_codes (tenant_id, phone, created_at DESC);
CREATE UNIQUE INDEX ux_otp_codes_session ON otp_codes (session_hash) WHERE session_hash IS NOT NULL;

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON otp_codes
    USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON otp_codes TO fieldops_app;
