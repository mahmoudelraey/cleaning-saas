-- Core: application role for RLS, subscription plans, tenants, staff users, refresh tokens.
-- Conventions: UUID keys, timestamps in UTC (timestamptz), money in halalas (bigint).

-- 1) Runtime role. The app does `SET LOCAL ROLE fieldops_app` inside every transaction,
--    so RLS policies apply even if the login user owns the tables or is a superuser.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fieldops_app') THEN
        CREATE ROLE fieldops_app NOLOGIN;
    END IF;
    EXECUTE format('GRANT fieldops_app TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO fieldops_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fieldops_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO fieldops_app;

-- 2) Plans (global, no tenant_id)
CREATE TABLE plans (
    id                    VARCHAR(30) PRIMARY KEY,
    name_ar               VARCHAR(100) NOT NULL,
    name_en               VARCHAR(100) NOT NULL,
    price_monthly_halalas BIGINT       NOT NULL CHECK (price_monthly_halalas >= 0),
    max_technicians       INTEGER      NOT NULL CHECK (max_technicians > 0),
    features              JSONB        NOT NULL DEFAULT '[]'::jsonb,
    active                BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO plans (id, name_ar, name_en, price_monthly_halalas, max_technicians, features) VALUES
    ('basic',    'أساسية',   'Basic',    14900,  3, '["scheduling","customers","booking_page","whatsapp_limited"]'),
    ('pro',      'احترافية', 'Pro',      29900, 10, '["scheduling","customers","booking_page","whatsapp","quotes_invoices","photos","reports"]'),
    ('business', 'أعمال',    'Business', 59900, 30, '["scheduling","customers","booking_page","whatsapp","quotes_invoices","photos","reports","online_payments","branding","priority_support"]');

-- 3) Tenants (the subscribing companies)
CREATE TABLE tenants (
    id            UUID PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    slug          VARCHAR(40)  NOT NULL UNIQUE,
    logo_url      VARCHAR(500),
    phone         VARCHAR(20),
    vat_number    VARCHAR(20),
    timezone      VARCHAR(50)  NOT NULL DEFAULT 'Asia/Riyadh',
    plan_id       VARCHAR(30)  NOT NULL REFERENCES plans (id),
    status        VARCHAR(20)  NOT NULL CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED')),
    trial_ends_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID
);

-- 4) Staff users. Not RLS-protected because login must look users up before a tenant is known;
--    every query on this table filters tenant_id explicitly in UserRepository.
CREATE TABLE users (
    id            UUID PRIMARY KEY,
    tenant_id     UUID         NOT NULL REFERENCES tenants (id),
    name          VARCHAR(150) NOT NULL,
    phone         VARCHAR(20)  NOT NULL,
    email         VARCHAR(200),
    password_hash VARCHAR(100) NOT NULL,
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('OWNER', 'COORDINATOR', 'TECHNICIAN')),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID
);

-- Login identifiers are global so a user can sign in without picking a company first.
CREATE UNIQUE INDEX ux_users_phone ON users (phone);
CREATE UNIQUE INDEX ux_users_email ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX ix_users_tenant ON users (tenant_id);

-- 5) Refresh tokens (stored hashed, rotated on every use)
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    replaced_by UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON plans, tenants, users, refresh_tokens TO fieldops_app;
