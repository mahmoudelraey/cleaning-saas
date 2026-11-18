-- Numeric limits per plan, editable in Platform → Plans (NULL = unlimited):
--   monthly_messages : automatic customer messages per month (OTP codes never counted)
--   monthly_bookings : bookings created per month (new bookings are refused once reached)
-- and per company, set by the platform admin in Platform → Companies (NULL = the plan's value).
-- Replaces the "whatsapp_limited" feature and the LIMITED_WHATSAPP_MONTHLY setting: every plan now has WhatsApp,
-- capped by its monthly_messages.

ALTER TABLE plans
    ADD COLUMN monthly_messages INT CHECK (monthly_messages >= 0),
    ADD COLUMN monthly_bookings INT CHECK (monthly_bookings >= 0);

ALTER TABLE tenants
    ADD COLUMN max_technicians_override  INT CHECK (max_technicians_override BETWEEN 1 AND 1000),
    ADD COLUMN monthly_messages_override INT CHECK (monthly_messages_override >= 0),
    ADD COLUMN monthly_bookings_override INT CHECK (monthly_bookings_override >= 0);

-- Hand-made plans: the old cap (100) where they had "whatsapp_limited" without "whatsapp", else unlimited.
UPDATE plans SET monthly_messages = 100
WHERE features ? 'whatsapp_limited' AND NOT features ? 'whatsapp';

-- Default plans (prices and technicians unchanged).
UPDATE plans SET monthly_messages = 100,  monthly_bookings = 100  WHERE id = 'starter';
UPDATE plans SET monthly_messages = 300,  monthly_bookings = 300  WHERE id = 'basic';
UPDATE plans SET monthly_messages = 1000, monthly_bookings = 1000 WHERE id = 'pro';
UPDATE plans SET monthly_messages = 3000, monthly_bookings = NULL WHERE id = 'business';

-- "whatsapp_limited" becomes plain "whatsapp" (the number decides the cap).
UPDATE plans p SET features = (
    SELECT COALESCE(jsonb_agg(DISTINCT f ORDER BY f), '[]'::jsonb)
    FROM (SELECT CASE WHEN f = 'whatsapp_limited' THEN 'whatsapp' ELSE f END AS f
          FROM jsonb_array_elements_text(p.features) AS f) x
), updated_at = now()
WHERE features ? 'whatsapp_limited';
