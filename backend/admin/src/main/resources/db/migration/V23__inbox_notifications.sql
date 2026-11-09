-- In-app notifications (the bell in the admin app and the customer portal). Stored here and read by polling:
-- no push, e-mail or other outside service. One row per recipient, so each person has their own read state.
CREATE TABLE inbox_notifications (
    id          UUID PRIMARY KEY,
    tenant_id   UUID         NOT NULL REFERENCES tenants (id),
    -- Exactly one recipient: a staff user, or a customer of the company.
    user_id     UUID REFERENCES users (id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers (id) ON DELETE CASCADE,
    kind        VARCHAR(40)  NOT NULL,
    booking_id  UUID REFERENCES bookings (id) ON DELETE CASCADE,
    -- The contact message, review or invoice the notification is about, when it is not a booking.
    ref_id      UUID,
    -- Booking or invoice number, and who did it (customer or company name), for the text.
    number      BIGINT,
    actor       VARCHAR(150),
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by  UUID,
    CONSTRAINT ck_inbox_one_recipient CHECK ((user_id IS NULL) <> (customer_id IS NULL))
);
CREATE INDEX ix_inbox_user ON inbox_notifications (tenant_id, user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX ix_inbox_customer ON inbox_notifications (tenant_id, customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX ix_inbox_unread_user ON inbox_notifications (user_id) WHERE read_at IS NULL AND user_id IS NOT NULL;
CREATE INDEX ix_inbox_unread_customer ON inbox_notifications (customer_id) WHERE read_at IS NULL AND customer_id IS NOT NULL;

ALTER TABLE inbox_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inbox_notifications
    USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON inbox_notifications TO fieldops_app;
