-- Plans are now defined by the pages they include (see PlanFeature):
--   messages, reviews, contact_requests, promos, invoices, quotes, photos, reports, sales, finance, payroll
--   plus booking_page, whatsapp_limited / whatsapp, branding, priority_support.
-- "quotes_invoices" splits into "invoices" + "quotes"; "reports" (which opened Reports, Sales, Finance and Payroll)
-- splits into one feature per page; "online_payments" is removed (no online payment yet).
-- Five default plans: Starter, Basic, Pro, Business, Enterprise. Prices and limits stay editable in Platform → Plans.
-- Trial companies get every feature in code (PlanFeature.DURING_TRIAL), whatever their trial plan.

-- 1. Plans the platform admin created by hand: keep what they could open before, in the new keys.
UPDATE plans p SET features = (
    SELECT COALESCE(jsonb_agg(DISTINCT f ORDER BY f), '[]'::jsonb)
    FROM (
        SELECT jsonb_array_elements_text(p.features) AS f
        UNION SELECT 'invoices' WHERE p.features ? 'quotes_invoices'
        UNION SELECT 'quotes'   WHERE p.features ? 'quotes_invoices'
        UNION SELECT 'sales'    WHERE p.features ? 'reports'
        UNION SELECT 'finance'  WHERE p.features ? 'reports'
        UNION SELECT 'payroll'  WHERE p.features ? 'reports'
        -- pages every plan had before
        UNION SELECT unnest(ARRAY['messages', 'reviews', 'contact_requests', 'promos'])
    ) x
    WHERE f NOT IN ('quotes_invoices', 'online_payments')
), updated_at = now()
WHERE id NOT IN ('starter', 'basic', 'pro', 'business', 'enterprise');

-- 2. The default plans, each adding pages to the one before.
INSERT INTO plans (id, name_ar, name_en, price_monthly_halalas, price_yearly_halalas, max_technicians, features,
                   active, sort_order)
VALUES ('starter', 'البداية', 'Starter', 7900, 79000, 1, '[]', TRUE, 1),
       ('enterprise', 'المؤسسات', 'Enterprise', 99900, 999000, 100, '[]', TRUE, 5)
ON CONFLICT (id) DO NOTHING;

UPDATE plans SET sort_order = CASE id WHEN 'starter' THEN 1 WHEN 'basic' THEN 2 WHEN 'pro' THEN 3
                                      WHEN 'business' THEN 4 WHEN 'enterprise' THEN 5 ELSE sort_order END,
                 updated_at = now()
WHERE id IN ('starter', 'basic', 'pro', 'business', 'enterprise');

UPDATE plans SET features = '["scheduling","customers","booking_page","whatsapp_limited"]', updated_at = now()
WHERE id = 'starter';

UPDATE plans SET features = '["scheduling","customers","booking_page","whatsapp_limited",
                              "messages","reviews","contact_requests","promos"]', updated_at = now()
WHERE id = 'basic';

UPDATE plans SET features = '["scheduling","customers","booking_page","whatsapp",
                              "messages","reviews","contact_requests","promos",
                              "invoices","quotes","photos","reports"]', updated_at = now()
WHERE id = 'pro';

UPDATE plans SET features = '["scheduling","customers","booking_page","whatsapp",
                              "messages","reviews","contact_requests","promos",
                              "invoices","quotes","photos","reports","sales","finance","payroll","branding"]',
                 updated_at = now()
WHERE id = 'business';

UPDATE plans SET features = '["scheduling","customers","booking_page","whatsapp",
                              "messages","reviews","contact_requests","promos",
                              "invoices","quotes","photos","reports","sales","finance","payroll","branding",
                              "priority_support"]', updated_at = now()
WHERE id = 'enterprise';
