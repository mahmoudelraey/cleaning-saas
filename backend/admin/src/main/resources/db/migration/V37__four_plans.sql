-- Four plans. Starter and Basic are office-only: no customer portal (booking_page) and nothing that lives in it
-- (reviews, promos, contact requests). Pro adds the portal; Business adds the business pages and priority support.
-- Enterprise (V36) is no longer offered: switched off, not deleted (companies may reference it). Prices and limits
-- stay as they are and remain editable in Platform → Plans.

UPDATE plans SET features = '["scheduling","customers","whatsapp_limited"]', updated_at = now()
WHERE id = 'starter';

UPDATE plans SET features = '["scheduling","customers","whatsapp_limited",
                              "messages","invoices","quotes","photos"]', updated_at = now()
WHERE id = 'basic';

UPDATE plans SET features = '["scheduling","customers","whatsapp",
                              "messages","invoices","quotes","photos",
                              "booking_page","reviews","promos","contact_requests","reports"]', updated_at = now()
WHERE id = 'pro';

UPDATE plans SET features = '["scheduling","customers","whatsapp",
                              "messages","invoices","quotes","photos",
                              "booking_page","reviews","promos","contact_requests","reports",
                              "sales","finance","payroll","branding","priority_support"]', updated_at = now()
WHERE id = 'business';

UPDATE plans SET active = FALSE, updated_at = now() WHERE id = 'enterprise';

UPDATE plans SET sort_order = CASE id WHEN 'starter' THEN 1 WHEN 'basic' THEN 2 WHEN 'pro' THEN 3
                                      WHEN 'business' THEN 4 ELSE sort_order END
WHERE id IN ('starter', 'basic', 'pro', 'business');
