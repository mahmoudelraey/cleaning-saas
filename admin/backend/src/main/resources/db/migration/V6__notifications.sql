-- Week 5: customer notifications (WhatsApp, SMS fallback), per-company settings, send log, scheduler lock.

ALTER TABLE tenants
    ADD COLUMN notify_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN notify_reminder     BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN notify_on_the_way   BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN notify_completed    BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN notify_cancelled    BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN reminder_hours      INTEGER NOT NULL DEFAULT 3 CHECK (reminder_hours BETWEEN 1 AND 48);

-- Outbox + send log in one table: rows are written in the same transaction as the booking change,
-- then a scheduled dispatcher sends them (with retries and SMS fallback).
CREATE TABLE notifications (
    id                  UUID PRIMARY KEY,
    tenant_id           UUID         NOT NULL REFERENCES tenants (id),
    booking_id          UUID REFERENCES bookings (id) ON DELETE SET NULL,
    template            VARCHAR(40)  NOT NULL,
    channel             VARCHAR(20),
    to_phone            VARCHAR(20)  NOT NULL,
    body                VARCHAR(1000) NOT NULL,
    params              JSONB        NOT NULL DEFAULT '[]'::jsonb,
    status              VARCHAR(20)  NOT NULL CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED')),
    provider_message_id VARCHAR(200),
    error               VARCHAR(500),
    attempts            INTEGER      NOT NULL DEFAULT 0,
    next_attempt_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    sent_at             TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID
);
CREATE INDEX ix_notifications_due ON notifications (tenant_id, status, next_attempt_at);
CREATE INDEX ix_notifications_booking ON notifications (booking_id);
CREATE INDEX ix_notifications_tenant_created ON notifications (tenant_id, created_at DESC);
-- One reminder per booking, even if the reminder job runs twice.
CREATE UNIQUE INDEX ux_notifications_one_reminder ON notifications (booking_id, template)
    WHERE template = 'BOOKING_REMINDER' AND booking_id IS NOT NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
    USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO fieldops_app;

-- Provider callbacks (delivery receipts) arrive without a tenant; this tiny global index maps the
-- provider's message id back to the owning tenant so the update can then run under that tenant's RLS.
CREATE TABLE notification_refs (
    provider_message_id VARCHAR(200) PRIMARY KEY,
    tenant_id           UUID NOT NULL REFERENCES tenants (id),
    notification_id     UUID NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_refs TO fieldops_app;

-- ShedLock: scheduled jobs run on one instance at a time.
CREATE TABLE shedlock (
    name       VARCHAR(64)  NOT NULL PRIMARY KEY,
    lock_until TIMESTAMP    NOT NULL,
    locked_at  TIMESTAMP    NOT NULL,
    locked_by  VARCHAR(255) NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON shedlock TO fieldops_app;
