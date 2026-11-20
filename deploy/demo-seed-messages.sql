-- FieldOps demo data: the customer messages log (Messages page) for screenshots / marketing videos.
-- Run AFTER demo-seed.sql (and demo-seed-billing.sql for the invoice / quote messages).
-- For every demo booking it writes the WhatsApp messages the system would have sent so far:
--   request received (online bookings), confirmed, reminder, technician on the way, visit completed, cancelled;
-- plus "invoice issued" for demo invoices and "quote sent" for demo quotes.
-- Only messages whose time has already passed are written. Nothing is actually sent to anyone.
-- Every row is tagged (provider_message_id 'DEMO-…') so demo-cleanup.sql removes it. Running it twice adds nothing.
--
-- Plain SQL: run it as one statement in any SQL console (IntelliJ, DBeaver, pgAdmin, psql) as user fieldops.
-- To fill another company, change the id on the line "t uuid := ...".

DO $$
DECLARE
    t       uuid := '44e21a02-426b-4567-8c69-54c02f6dbb48';
    zone    text;
    company text;
    rem_h   int;
    added   int;
BEGIN
    SELECT coalesce(timezone, 'Asia/Riyadh'), name, coalesce(reminder_hours, 3)
      INTO zone, company, rem_h FROM tenants WHERE id = t;
    IF NOT FOUND THEN RAISE EXCEPTION 'Company % not found', t; END IF;
    IF NOT EXISTS (SELECT 1 FROM bookings WHERE tenant_id = t AND internal_notes = 'DEMO') THEN
        RAISE EXCEPTION 'No demo bookings: run demo-seed.sql first';
    END IF;
    IF EXISTS (SELECT 1 FROM notifications WHERE tenant_id = t AND provider_message_id LIKE 'DEMO-%') THEN
        RAISE NOTICE 'Demo messages already exist: nothing added';
        RETURN;
    END IF;

    CREATE TEMP TABLE demo_msg (booking_id uuid, template text, to_phone text, body text, at timestamptz) ON COMMIT DROP;

    -- ---------------------------------------------------------------- booking messages
    WITH b AS (
        SELECT bk.id, bk.number, bk.status, bk.source, bk.scheduled_start AS st, bk.scheduled_end AS en,
               bk.created_at, c.name AS cname, c.phone AS cphone,
               to_char(bk.scheduled_start AT TIME ZONE zone, 'DD/MM/YYYY') AS d,
               to_char(bk.scheduled_start AT TIME ZONE zone, 'HH12:MI') ||
                   CASE WHEN extract(hour FROM bk.scheduled_start AT TIME ZONE zone) < 12 THEN ' ص' ELSE ' م' END AS tm,
               (SELECT u.name FROM assignments a JOIN technicians te ON te.id = a.technician_id
                  JOIN users u ON u.id = te.user_id WHERE a.booking_id = bk.id LIMIT 1) AS tech
          FROM bookings bk JOIN customers c ON c.id = bk.customer_id
         WHERE bk.tenant_id = t AND bk.internal_notes = 'DEMO'
    )
    INSERT INTO demo_msg (booking_id, template, to_phone, body, at)
    SELECT id, 'BOOKING_RECEIVED', cphone,
           format('مرحباً %s، استلمت %s طلبك رقم #%s ليوم %s الساعة %s. سنؤكد الموعد قريباً.', cname, company, number, d, tm),
           created_at + interval '1 minute'
      FROM b WHERE source IN ('PORTAL', 'PUBLIC_PAGE')
    UNION ALL
    SELECT id, 'BOOKING_CONFIRMED', cphone,
           format('مرحباً %s، تم تأكيد موعدك مع %s يوم %s الساعة %s. رقم الطلب #%s.', cname, company, d, tm, number),
           created_at + interval '12 minutes'
      FROM b WHERE status NOT IN ('NEW', 'CANCELLED')
    UNION ALL
    SELECT id, 'BOOKING_REMINDER', cphone,
           format('تذكير: موعدك مع %s يوم %s الساعة %s. رقم الطلب #%s.', company, d, tm, number),
           st - make_interval(hours => rem_h)
      FROM b WHERE status NOT IN ('NEW', 'CANCELLED')
    UNION ALL
    SELECT id, 'TECHNICIAN_ON_THE_WAY', cphone,
           format('مرحباً %s، الفني %s من %s في الطريق إليك الآن (طلب #%s).', cname, coalesce(tech, 'المختص'), company, number),
           st - interval '35 minutes'
      FROM b WHERE status IN ('ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED')
    UNION ALL
    SELECT id, 'VISIT_COMPLETED', cphone,
           format('شكراً %s! اكتملت زيارة %s (طلب #%s). يسعدنا خدمتك دائماً.', cname, company, number),
           en + interval '4 minutes'
      FROM b WHERE status = 'COMPLETED'
    UNION ALL
    SELECT id, 'BOOKING_CANCELLED', cphone,
           format('مرحباً %s، تم إلغاء طلبك #%s لدى %s.', cname, number, company),
           st - interval '1 day'
      FROM b WHERE status = 'CANCELLED';

    -- ---------------------------------------------------------------- invoices of demo bookings / customers
    INSERT INTO demo_msg (booking_id, template, to_phone, body, at)
    SELECT i.booking_id, 'INVOICE_ISSUED', i.customer_phone,
           format('مرحباً %s، فاتورة %s رقم INV-%s بمبلغ %s ر.س: https://field-ops.duckdns.org/i/%s',
                  i.customer_name, company, i.number, to_char(i.total_halalas / 100.0, 'FM999,990.00'),
                  substr(md5(i.id::text), 1, 12)),
           i.issued_at + interval '2 minutes'
      FROM invoices i
     WHERE i.tenant_id = t AND i.customer_phone IS NOT NULL
       AND (i.booking_id IN (SELECT id FROM bookings WHERE tenant_id = t AND internal_notes = 'DEMO')
            OR i.customer_id IN (SELECT id FROM customers WHERE tenant_id = t AND notes = 'DEMO'));

    -- ---------------------------------------------------------------- quotes of demo customers
    INSERT INTO demo_msg (booking_id, template, to_phone, body, at)
    SELECT q.booking_id, 'QUOTE_SENT', q.customer_phone,
           format('مرحباً %s، عرض سعر من %s رقم Q-%s بمبلغ %s ر.س. للاطلاع والموافقة: https://field-ops.duckdns.org/q/%s',
                  q.customer_name, company, q.number, to_char(q.total_halalas / 100.0, 'FM999,990.00'),
                  substr(md5(q.id::text), 1, 12)),
           q.created_at + interval '5 minutes'
      FROM quotes q
     WHERE q.tenant_id = t AND q.customer_phone IS NOT NULL
       AND q.customer_id IN (SELECT id FROM customers WHERE tenant_id = t AND notes = 'DEMO');

    -- ---------------------------------------------------------------- write them (only what already happened)
    INSERT INTO notifications (id, tenant_id, booking_id, template, channel, provider, to_phone, body, params, status,
                               provider_message_id, attempts, next_attempt_at, sent_at, delivered_at,
                               created_at, updated_at, created_by)
    SELECT gen_random_uuid(), t, m.booking_id, m.template, 'WHATSAPP', 'META_WHATSAPP', m.to_phone, left(m.body, 1000),
           '[]'::jsonb,
           -- the last hour: sent; otherwise read, with every fourth one only delivered
           CASE WHEN m.at > now() - interval '1 hour' THEN 'SENT'
                WHEN row_number() OVER (ORDER BY m.at) % 4 = 0 THEN 'DELIVERED'
                ELSE 'READ' END,
           'DEMO-' || gen_random_uuid(), 1, m.at, m.at + interval '2 seconds',
           CASE WHEN m.at > now() - interval '1 hour' THEN NULL ELSE m.at + interval '9 seconds' END,
           m.at, m.at + interval '9 seconds', NULL
      FROM demo_msg m
     WHERE m.at <= now() AND m.to_phone IS NOT NULL;
    GET DIAGNOSTICS added = ROW_COUNT;
    RAISE NOTICE 'Added % demo messages', added;
END $$;
