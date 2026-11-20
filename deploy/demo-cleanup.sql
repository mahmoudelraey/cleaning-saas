-- Removes everything demo-seed.sql and demo-seed-billing.sql added to the company, and nothing else:
--   demo bookings (internal note 'DEMO') with items, assignments, history, reviews and messages,
--   the demo messages log from demo-seed-messages.sql,
--   invoices / quotes of demo customers with their lines and payments,
--   demo customers (note 'DEMO') with addresses, demo technicians (email demo.tech*@example.com),
--   demo payroll (employees with note 'DEMO', their salaries and payments),
--   demo promo codes, demo services (and options) no other booking uses, demo expenses (reference 'DEMO'),
--   demo contact requests. The public page text from demo-seed-portal.sql is kept (edit it in Settings).
-- Plain SQL: run the whole file in any SQL console (IntelliJ: select all, then Execute) as user fieldops.
-- To clean another company, replace the id everywhere (Ctrl+R).

BEGIN;

CREATE TEMP TABLE demo_c ON COMMIT DROP AS
    SELECT id FROM customers WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND notes = 'DEMO';
CREATE TEMP TABLE demo_b ON COMMIT DROP AS
    SELECT id FROM bookings WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND internal_notes = 'DEMO';
CREATE TEMP TABLE demo_docs ON COMMIT DROP AS
    SELECT id, 'INVOICE' AS kind FROM invoices
     WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48'
       AND (customer_id IN (SELECT id FROM demo_c) OR booking_id IN (SELECT id FROM demo_b))
    UNION ALL
    SELECT id, 'QUOTE' FROM quotes
     WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48'
       AND (customer_id IN (SELECT id FROM demo_c) OR booking_id IN (SELECT id FROM demo_b));

-- invoices and quotes
DELETE FROM public_links   WHERE document_id IN (SELECT id FROM demo_docs);
DELETE FROM payments       WHERE invoice_id IN (SELECT id FROM demo_docs WHERE kind = 'INVOICE');
DELETE FROM document_lines WHERE invoice_id IN (SELECT id FROM demo_docs WHERE kind = 'INVOICE')
                              OR quote_id   IN (SELECT id FROM demo_docs WHERE kind = 'QUOTE');
DELETE FROM invoices       WHERE id IN (SELECT id FROM demo_docs WHERE kind = 'INVOICE');
DELETE FROM quotes         WHERE id IN (SELECT id FROM demo_docs WHERE kind = 'QUOTE');

-- bookings
DELETE FROM visit_reviews  WHERE booking_id IN (SELECT id FROM demo_b);
DELETE FROM visit_events   WHERE booking_id IN (SELECT id FROM demo_b);
DELETE FROM assignments    WHERE booking_id IN (SELECT id FROM demo_b);
DELETE FROM notifications  WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND provider_message_id LIKE 'DEMO-%';
DELETE FROM notification_refs WHERE notification_id IN
       (SELECT id FROM notifications WHERE booking_id IN (SELECT id FROM demo_b));
DELETE FROM notifications  WHERE booking_id IN (SELECT id FROM demo_b);
DELETE FROM booking_items  WHERE booking_id IN (SELECT id FROM demo_b);
DELETE FROM bookings       WHERE id IN (SELECT id FROM demo_b);

-- contact requests (they point at demo customers)
DELETE FROM contact_messages WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND email = 'demo.contact@example.com';

-- customers
DELETE FROM addresses a WHERE a.customer_id IN (SELECT id FROM demo_c)
   AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.address_id = a.id);
DELETE FROM customers c WHERE c.id IN (SELECT id FROM demo_c)
   AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.customer_id = c.id);

-- payroll
DELETE FROM salary_payments WHERE salary_record_id IN
       (SELECT r.id FROM salary_records r JOIN employees e ON e.id = r.employee_id
         WHERE e.tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND e.notes = 'DEMO');
DELETE FROM salary_records WHERE employee_id IN
       (SELECT id FROM employees WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND notes = 'DEMO');
DELETE FROM employees WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND notes = 'DEMO';

-- technicians
DELETE FROM technicians WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND user_id IN
       (SELECT id FROM users WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND email LIKE 'demo.tech%@example.com')
   AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.technician_id = technicians.id);
DELETE FROM refresh_tokens WHERE user_id IN
       (SELECT id FROM users WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND email LIKE 'demo.tech%@example.com');
DELETE FROM users u WHERE u.tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND u.email LIKE 'demo.tech%@example.com'
   AND NOT EXISTS (SELECT 1 FROM technicians t WHERE t.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id);

-- promo codes (only when no remaining booking uses them)
DELETE FROM promos p WHERE p.tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48'
   AND p.code IN ('WINTER20', 'WELCOME50', 'CLEAN15', 'NATIONALDAY')
   AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.promo_id = p.id);

-- services
DELETE FROM service_options o USING services s
 WHERE o.service_id = s.id AND s.tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48'
   AND s.name IN ('تنظيف شقة', 'غسيل كنب', 'صيانة وتنظيف مكيف', 'تنظيف عميق للفلل', 'مكافحة حشرات', 'غسيل سجاد')
   AND NOT EXISTS (SELECT 1 FROM booking_items i WHERE i.service_id = s.id)
   AND NOT EXISTS (SELECT 1 FROM document_lines l WHERE l.service_id = s.id);
DELETE FROM services s
 WHERE s.tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48'
   AND s.name IN ('تنظيف شقة', 'غسيل كنب', 'صيانة وتنظيف مكيف', 'تنظيف عميق للفلل', 'مكافحة حشرات', 'غسيل سجاد')
   AND NOT EXISTS (SELECT 1 FROM booking_items i WHERE i.service_id = s.id)
   AND NOT EXISTS (SELECT 1 FROM document_lines l WHERE l.service_id = s.id);

-- expenses
DELETE FROM expenses WHERE tenant_id = '44e21a02-426b-4567-8c69-54c02f6dbb48' AND reference = 'DEMO';

COMMIT;
