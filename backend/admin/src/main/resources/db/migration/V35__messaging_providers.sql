-- Message providers the platform admin switches on and off (Platform → Settings → Messaging): Meta WhatsApp Cloud
-- API, Gupshup WhatsApp, Twilio (WhatsApp + SMS), Taqnyat SMS, Unifonic SMS. One row per provider.
--   enabled    : switched on by the platform admin
--   priority   : lower is tried first among the providers ready for a channel (WhatsApp, SMS)
--   saved      : false until saved once in the console; Meta and Unifonic then keep using the environment variables
--   settings   : non-secret fields {"phoneNumberId": "...", "apiUrl": "..."}
--   secrets    : secret fields, each value AES-GCM encrypted with SETTINGS_ENCRYPTION_KEY ("enc:v1:...")
--   templates  : provider template name / id per message type {"BOOKING_CONFIRMED": "booking_confirmed"}
-- The WhatsApp / SMS columns of platform_settings move here and are dropped.
CREATE TABLE messaging_providers (
    provider   VARCHAR(30)  PRIMARY KEY,
    enabled    BOOLEAN      NOT NULL DEFAULT FALSE,
    priority   INT          NOT NULL DEFAULT 100,
    saved      BOOLEAN      NOT NULL DEFAULT FALSE,
    settings   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    secrets    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    templates  JSONB        NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by UUID
);

-- Existing Meta WhatsApp settings (secrets are already encrypted with the same key, so they are copied as they are).
INSERT INTO messaging_providers (provider, enabled, priority, saved, settings, secrets, templates, updated_at, updated_by)
SELECT 'META_WHATSAPP', whatsapp_enabled, 10, messaging_configured,
       jsonb_strip_nulls(jsonb_build_object(
           'apiUrl', whatsapp_api_url, 'apiVersion', whatsapp_api_version,
           'phoneNumberId', whatsapp_phone_number_id, 'businessAccountId', whatsapp_business_account_id,
           'language', whatsapp_language)),
       jsonb_strip_nulls(jsonb_build_object(
           'accessToken', whatsapp_access_token, 'appSecret', whatsapp_app_secret,
           'verifyToken', whatsapp_verify_token)),
       COALESCE(whatsapp_templates, '{}'::jsonb), updated_at, updated_by
FROM platform_settings WHERE id = 1;

-- Existing Unifonic SMS settings.
INSERT INTO messaging_providers (provider, enabled, priority, saved, settings, secrets, updated_at, updated_by)
SELECT 'UNIFONIC_SMS', sms_enabled, 50, messaging_configured,
       jsonb_strip_nulls(jsonb_build_object('apiUrl', sms_api_url, 'senderId', sms_sender_id)),
       jsonb_strip_nulls(jsonb_build_object('appSid', sms_app_sid)),
       updated_at, updated_by
FROM platform_settings WHERE id = 1;

-- New providers start switched off.
INSERT INTO messaging_providers (provider, priority) VALUES
    ('META_WHATSAPP', 10), ('GUPSHUP_WHATSAPP', 20), ('TWILIO', 30), ('TAQNYAT_SMS', 40), ('UNIFONIC_SMS', 50)
ON CONFLICT (provider) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON messaging_providers TO fieldops_app;

ALTER TABLE platform_settings
    DROP COLUMN messaging_configured,
    DROP COLUMN whatsapp_enabled,
    DROP COLUMN whatsapp_api_url,
    DROP COLUMN whatsapp_api_version,
    DROP COLUMN whatsapp_phone_number_id,
    DROP COLUMN whatsapp_business_account_id,
    DROP COLUMN whatsapp_access_token,
    DROP COLUMN whatsapp_app_secret,
    DROP COLUMN whatsapp_verify_token,
    DROP COLUMN whatsapp_language,
    DROP COLUMN whatsapp_templates,
    DROP COLUMN sms_enabled,
    DROP COLUMN sms_api_url,
    DROP COLUMN sms_app_sid,
    DROP COLUMN sms_sender_id;

-- Which provider carried (or last tried) each message.
ALTER TABLE notifications ADD COLUMN provider VARCHAR(30);
UPDATE notifications SET provider = CASE channel WHEN 'WHATSAPP' THEN 'META_WHATSAPP'
                                                 WHEN 'SMS' THEN 'UNIFONIC_SMS'
                                                 WHEN 'LOG' THEN 'LOG' END
WHERE channel IS NOT NULL;
