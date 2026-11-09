-- Platform console: the FieldOps owner manages subscription plans, companies (trial, plan, paid period, suspension)
-- and the platform-wide WhatsApp / SMS credentials from the admin app.

-- 1. Plans: optional yearly price and display order (the plan picker shows active plans in this order).
ALTER TABLE plans
    ADD COLUMN price_yearly_halalas BIGINT CHECK (price_yearly_halalas >= 0),
    ADD COLUMN sort_order           INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE plans SET sort_order = CASE id WHEN 'basic' THEN 1 WHEN 'pro' THEN 2 WHEN 'business' THEN 3 ELSE 9 END;

-- 2. The platform owner's account. It belongs to a dedicated "platform" tenant, so login, tokens and RLS work
--    unchanged; that tenant has no customers and never appears in the companies list.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('OWNER', 'COORDINATOR', 'TECHNICIAN', 'PLATFORM_ADMIN'));

ALTER TABLE tenants
    ADD COLUMN platform      BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Paid subscriptions (activated by the platform owner until online payment exists).
    ADD COLUMN billing_cycle VARCHAR(10) CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
    ADD COLUMN paid_until    TIMESTAMPTZ,
    ADD COLUMN status_note   VARCHAR(500);
CREATE UNIQUE INDEX ux_tenants_one_platform ON tenants (platform) WHERE platform;

INSERT INTO tenants (id, name, slug, timezone, plan_id, status, platform, booking_page_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'FieldOps', 'fieldops-platform', 'Asia/Riyadh', 'business',
        'ACTIVE', TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- 3. Platform settings: one row. Secrets (tokens, app secret, AppSid) are stored AES-GCM encrypted with
--    SETTINGS_ENCRYPTION_KEY. Until messaging is saved once here, the app keeps using the environment variables.
CREATE TABLE platform_settings (
    id                           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    trial_days                   INTEGER      NOT NULL DEFAULT 14 CHECK (trial_days BETWEEN 1 AND 365),
    trial_plan_id                VARCHAR(30)  NOT NULL DEFAULT 'pro' REFERENCES plans (id),
    -- Days a company stays usable (PAST_DUE) after its paid period ends, before it is suspended.
    grace_days                   INTEGER      NOT NULL DEFAULT 7 CHECK (grace_days BETWEEN 0 AND 90),
    support_whatsapp             VARCHAR(20),
    support_email                VARCHAR(200),
    messaging_configured         BOOLEAN      NOT NULL DEFAULT FALSE,
    whatsapp_enabled             BOOLEAN      NOT NULL DEFAULT FALSE,
    whatsapp_api_url             VARCHAR(300),
    whatsapp_api_version         VARCHAR(20),
    whatsapp_phone_number_id     VARCHAR(60),
    whatsapp_business_account_id VARCHAR(60),
    whatsapp_access_token        TEXT,
    whatsapp_app_secret          TEXT,
    whatsapp_verify_token        TEXT,
    whatsapp_language            VARCHAR(10),
    whatsapp_templates           JSONB        NOT NULL DEFAULT '{}'::jsonb,
    sms_enabled                  BOOLEAN      NOT NULL DEFAULT FALSE,
    sms_api_url                  VARCHAR(300),
    sms_app_sid                  TEXT,
    sms_sender_id                VARCHAR(20),
    updated_at                   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by                   UUID
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4. What the platform owner changed, per company.
CREATE TABLE platform_audit (
    id         UUID PRIMARY KEY,
    tenant_id  UUID REFERENCES tenants (id) ON DELETE CASCADE,
    action     VARCHAR(40)   NOT NULL,
    details    VARCHAR(1000),
    actor_id   UUID,
    actor_name VARCHAR(150),
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_platform_audit_tenant ON platform_audit (tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON platform_settings TO fieldops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_audit TO fieldops_app;
