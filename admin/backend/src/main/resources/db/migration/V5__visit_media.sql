-- Week 4: before/after photos taken by technicians. Files live in object storage (local disk in dev,
-- S3-compatible in production); this table holds metadata and the storage key.
CREATE TABLE media (
    id           UUID PRIMARY KEY,
    tenant_id    UUID         NOT NULL REFERENCES tenants (id),
    booking_id   UUID         NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    kind         VARCHAR(10)  NOT NULL CHECK (kind IN ('BEFORE', 'AFTER', 'OTHER')),
    storage_key  VARCHAR(300) NOT NULL UNIQUE,
    content_type VARCHAR(50)  NOT NULL,
    size_bytes   BIGINT       NOT NULL CHECK (size_bytes > 0),
    uploaded_by_name VARCHAR(150),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by   UUID
);
CREATE INDEX ix_media_booking ON media (booking_id, created_at);

ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE media FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON media
    USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON media TO fieldops_app;
