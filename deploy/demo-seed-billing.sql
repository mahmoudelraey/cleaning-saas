-- FieldOps demo data, part 2: invoices, quotes, payroll and promo codes.
-- Run AFTER demo-seed.sql (it uses the demo customers, services, technicians and bookings it created).
-- Plain SQL: run it as one statement in any SQL console (IntelliJ, DBeaver, pgAdmin, psql) as user fieldops.
-- All-or-nothing: on any error nothing is saved. Remove everything with demo-cleanup.sql.
--
-- Adds:
--   * 4 promo codes (one shown on the booking page, one for first bookings, one with a minimum, one expired)
--   * up to 8 VAT invoices from completed demo bookings: paid, partly paid and unpaid, with payments
--   * 5 quotes: draft, sent, accepted and rejected
--   * payroll: the 4 demo technicians + 1 office employee without an app account, salaries for the last
--     2 months (paid) and this month (pending / partly paid)
-- VAT follows the company settings: 15% when it has a VAT number, prices with or without VAT as configured.

DO $$
DECLARE
    t        uuid := '44e21a02-426b-4567-8c69-54c02f6dbb48';
    zone     text;
    owner_id uuid;
    co       record;
    vat_reg  boolean;
    incl     boolean;
    inv_no   bigint;
    q_no     bigint;
    b        record;
    l        record;
    c        record;
    e        record;
    inv_id   uuid; q_id uuid; emp_id uuid; rec_id uuid;
    lines_total bigint; disc bigint; taxable bigint; vat bigint; total bigint; paid bigint;
    n int := 0; i int; v_status text; pay_method text;
    month_start date; m date; base bigint; allow bigint; ot bigint; bonus bigint; ded bigint; ec bigint; net bigint;
    s_deep uuid; s_ac uuid; s_sofa uuid; s_pest uuid;
    welcome uuid := gen_random_uuid();
BEGIN
    SELECT * INTO co FROM tenants WHERE id = t;
    IF NOT FOUND THEN RAISE EXCEPTION 'Company % not found', t; END IF;
    IF NOT EXISTS (SELECT 1 FROM bookings WHERE tenant_id = t AND internal_notes = 'DEMO') THEN
        RAISE EXCEPTION 'Run demo-seed.sql first (no demo bookings found)';
    END IF;
    zone := coalesce(co.timezone, 'Asia/Riyadh');
    vat_reg := co.vat_number IS NOT NULL AND btrim(co.vat_number) <> '';
    incl := co.prices_include_vat;
    SELECT id INTO owner_id FROM users WHERE tenant_id = t AND role = 'OWNER' ORDER BY created_at LIMIT 1;
    SELECT id INTO s_deep FROM services WHERE tenant_id = t AND name = 'تنظيف عميق للفلل' ORDER BY created_at DESC LIMIT 1;
    SELECT id INTO s_ac   FROM services WHERE tenant_id = t AND name = 'صيانة وتنظيف مكيف' ORDER BY created_at DESC LIMIT 1;
    SELECT id INTO s_sofa FROM services WHERE tenant_id = t AND name = 'غسيل كنب' ORDER BY created_at DESC LIMIT 1;
    SELECT id INTO s_pest FROM services WHERE tenant_id = t AND name = 'مكافحة حشرات' ORDER BY created_at DESC LIMIT 1;

    -- ================================================================ promo codes
    INSERT INTO promos (id, tenant_id, code, title, title_en, discount_type, discount_value, max_discount_halalas,
                        min_subtotal_halalas, starts_at, ends_at, usage_limit, per_customer_limit,
                        first_booking_only, active, announce, created_by) VALUES
      (gen_random_uuid(), t, 'WINTER20', 'خصم الشتاء 20٪ على كل الخدمات', 'Winter offer: 20% off every service',
       'PERCENT', 20, 10000, 0, now() - interval '5 days', now() + interval '30 days', 200, 1, false, true, true, owner_id),
      (welcome, t, 'WELCOME50', 'خصم 50 ريال على أول حجز', 'SAR 50 off your first booking',
       'AMOUNT', 5000, NULL, 15000, NULL, NULL, NULL, 1, true, true, false, owner_id),
      (gen_random_uuid(), t, 'CLEAN15', 'خصم 15٪ للطلبات فوق 400 ريال', '15% off orders over SAR 400',
       'PERCENT', 15, 15000, 40000, now() - interval '10 days', now() + interval '60 days', 100, 2, false, true, false, owner_id),
      (gen_random_uuid(), t, 'NATIONALDAY', 'عرض اليوم الوطني', 'National Day offer',
       'PERCENT', 25, 20000, 0, now() - interval '70 days', now() - interval '50 days', 300, 1, false, true, false, owner_id)
    ON CONFLICT (tenant_id, code) DO NOTHING;
    SELECT id INTO welcome FROM promos WHERE tenant_id = t AND code = 'WELCOME50';

    -- two upcoming demo bookings used a code
    FOR b IN SELECT id, subtotal_halalas FROM bookings
             WHERE tenant_id = t AND internal_notes = 'DEMO' AND status IN ('NEW', 'CONFIRMED') AND promo_id IS NULL
             ORDER BY scheduled_start LIMIT 2 LOOP
        UPDATE bookings SET promo_id = welcome, promo_code = 'WELCOME50',
                            discount_halalas = least(5000, b.subtotal_halalas) WHERE id = b.id;
    END LOOP;

    -- ================================================================ invoices from completed demo bookings
    SELECT coalesce(max(next_value), 1) INTO inv_no FROM tenant_counters WHERE tenant_id = t AND name = 'invoice';
    FOR b IN SELECT bk.*, cu.name AS cname, cu.phone AS cphone FROM bookings bk JOIN customers cu ON cu.id = bk.customer_id
             WHERE bk.tenant_id = t AND bk.internal_notes = 'DEMO' AND bk.status = 'COMPLETED'
               AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = bk.id AND i.status <> 'VOID')
             ORDER BY bk.scheduled_start LIMIT 8 LOOP
        n := n + 1;
        inv_id := gen_random_uuid();
        SELECT coalesce(sum(total_halalas), 0) INTO lines_total FROM booking_items WHERE booking_id = b.id;
        disc := least(b.discount_halalas, lines_total);
        IF NOT vat_reg THEN
            taxable := lines_total - disc; vat := 0; total := taxable;
        ELSIF incl THEN
            total := lines_total - disc; taxable := round(total / 1.15); vat := total - taxable;
        ELSE
            taxable := lines_total - disc; vat := round(taxable * 0.15); total := taxable + vat;
        END IF;
        v_status := CASE WHEN n % 4 = 0 THEN 'ISSUED' WHEN n % 4 = 3 THEN 'PARTIALLY_PAID' ELSE 'PAID' END;
        paid := CASE v_status WHEN 'PAID' THEN total WHEN 'PARTIALLY_PAID' THEN round(total / 2.0) ELSE 0 END;
        INSERT INTO invoices (id, tenant_id, number, booking_id, customer_id, customer_name, customer_phone,
                              seller_name, seller_vat_number, seller_address, seller_cr, issued_at, due_date, status,
                              prices_include_vat, vat_rate_bp, lines_total_halalas, discount_halalas, taxable_halalas,
                              vat_halalas, total_halalas, paid_halalas, zatca_uuid, created_at, created_by)
        VALUES (inv_id, t, inv_no, b.id, b.customer_id, b.cname, b.cphone, co.name, co.vat_number, co.address,
                co.commercial_registration, b.completed_at + interval '1 hour',
                ((b.completed_at AT TIME ZONE zone)::date + 7), v_status, incl, CASE WHEN vat_reg THEN 1500 ELSE 0 END,
                lines_total, disc, taxable, vat, total, paid, gen_random_uuid(), b.completed_at + interval '1 hour', owner_id);
        i := 0;
        FOR l IN SELECT bi.*, s.name AS sname, s.name_en AS sname_en, o.name AS oname, o.name_en AS oname_en
                 FROM booking_items bi JOIN services s ON s.id = bi.service_id
                 LEFT JOIN service_options o ON o.id = bi.option_id
                 WHERE bi.booking_id = b.id ORDER BY bi.position LOOP
            INSERT INTO document_lines (id, tenant_id, invoice_id, position, description, description_en, quantity,
                                        unit_price_halalas, total_halalas, service_id, option_id, created_by)
            VALUES (gen_random_uuid(), t, inv_id, i,
                    l.sname || coalesce(' (' || l.oname || ')', ''),
                    coalesce(l.sname_en, l.sname) || coalesce(' (' || coalesce(l.oname_en, l.oname) || ')', ''),
                    l.quantity, l.unit_price_halalas, l.total_halalas, l.service_id, l.option_id, owner_id);
            i := i + 1;
        END LOOP;
        IF paid > 0 THEN
            pay_method := coalesce(b.payment_method, 'CASH');
            INSERT INTO payments (id, tenant_id, invoice_id, method, amount_halalas, reference, paid_at, created_by)
            VALUES (gen_random_uuid(), t, inv_id, pay_method, paid,
                    CASE WHEN pay_method = 'BANK_TRANSFER' THEN 'TRX-' || (100000 + n * 731) END,
                    b.completed_at + interval '2 hours', owner_id);
        END IF;
        UPDATE bookings SET invoice_state = 'ISSUED' WHERE id = b.id;
        INSERT INTO visit_events (id, tenant_id, booking_id, type, note, actor_name, created_at, created_by)
        VALUES (gen_random_uuid(), t, b.id, 'INVOICE_ISSUED', 'INV-' || inv_no, 'النظام', b.completed_at + interval '1 hour', owner_id);
        inv_no := inv_no + 1;
    END LOOP;
    INSERT INTO tenant_counters (tenant_id, name, next_value) VALUES (t, 'invoice', inv_no)
    ON CONFLICT (tenant_id, name) DO UPDATE SET next_value = excluded.next_value;

    -- ================================================================ quotes
    SELECT coalesce(max(next_value), 1) INTO q_no FROM tenant_counters WHERE tenant_id = t AND name = 'quote';
    i := 0;
    FOR c IN SELECT id, name, phone FROM customers WHERE tenant_id = t AND notes = 'DEMO' ORDER BY created_at DESC LIMIT 5 LOOP
        i := i + 1;
        q_id := gen_random_uuid();
        -- villa deep clean + AC units, or sofa + pest control
        lines_total := CASE WHEN i % 2 = 1 THEN 120000 + 4 * 15000 ELSE 2 * 20000 + 25000 END;
        disc := CASE WHEN i = 3 THEN 10000 ELSE 0 END;
        IF NOT vat_reg THEN
            taxable := lines_total - disc; vat := 0; total := taxable;
        ELSIF incl THEN
            total := lines_total - disc; taxable := round(total / 1.15); vat := total - taxable;
        ELSE
            taxable := lines_total - disc; vat := round(taxable * 0.15); total := taxable + vat;
        END IF;
        v_status := (ARRAY['SENT', 'ACCEPTED', 'DRAFT', 'REJECTED', 'SENT'])[i];
        INSERT INTO quotes (id, tenant_id, number, customer_id, customer_name, customer_phone, status, valid_until,
                            prices_include_vat, vat_rate_bp, lines_total_halalas, discount_halalas, taxable_halalas,
                            vat_halalas, total_halalas, notes, responded_at, created_at, created_by)
        VALUES (q_id, t, q_no, c.id, c.name, c.phone, v_status, (now() AT TIME ZONE zone)::date + 14, incl,
                CASE WHEN vat_reg THEN 1500 ELSE 0 END, lines_total, disc, taxable, vat, total,
                'العرض شامل المواد والمعدات، ومدة التنفيذ يوم واحد',
                CASE WHEN v_status IN ('ACCEPTED', 'REJECTED') THEN now() - interval '1 day' END,
                now() - make_interval(days => i), owner_id);
        IF i % 2 = 1 THEN
            INSERT INTO document_lines (id, tenant_id, quote_id, position, description, description_en, quantity,
                                        unit_price_halalas, total_halalas, service_id, created_by) VALUES
              (gen_random_uuid(), t, q_id, 0, 'تنظيف عميق للفلل', 'Villa deep cleaning', 1, 120000, 120000, s_deep, owner_id),
              (gen_random_uuid(), t, q_id, 1, 'صيانة وتنظيف مكيف', 'AC cleaning & maintenance', 4, 15000, 60000, s_ac, owner_id);
        ELSE
            INSERT INTO document_lines (id, tenant_id, quote_id, position, description, description_en, quantity,
                                        unit_price_halalas, total_halalas, service_id, created_by) VALUES
              (gen_random_uuid(), t, q_id, 0, 'غسيل كنب', 'Sofa washing', 2, 20000, 40000, s_sofa, owner_id),
              (gen_random_uuid(), t, q_id, 1, 'مكافحة حشرات', 'Pest control', 1, 25000, 25000, s_pest, owner_id);
        END IF;
        q_no := q_no + 1;
    END LOOP;
    INSERT INTO tenant_counters (tenant_id, name, next_value) VALUES (t, 'quote', q_no)
    ON CONFLICT (tenant_id, name) DO UPDATE SET next_value = excluded.next_value;

    -- ================================================================ payroll
    -- the demo technicians (linked to their accounts) + one office employee without an app account
    FOR e IN
        SELECT u.id AS user_id, u.name, u.phone, 'فني' AS job, (350000 + (row_number() OVER (ORDER BY u.created_at)) * 25000)::bigint AS base
        FROM users u WHERE u.tenant_id = t AND u.email LIKE 'demo.tech%@example.com'
          AND NOT EXISTS (SELECT 1 FROM employees x WHERE x.user_id = u.id)
        UNION ALL
        SELECT NULL, 'هند العبدالله', '+966551112233', 'محاسبة', 600000
        WHERE NOT EXISTS (SELECT 1 FROM employees x WHERE x.tenant_id = t AND x.notes = 'DEMO' AND x.user_id IS NULL)
    LOOP
        emp_id := gen_random_uuid();
        allow := round(e.base * 0.25) + 50000;             -- housing 25% + transport 500
        ec := round((e.base + round(e.base * 0.25)) * 0.12); -- employer contributions (GOSI)
        INSERT INTO employees (id, tenant_id, user_id, name, job_title, phone, base_salary_halalas, housing_halalas,
                               transport_halalas, employer_cost_halalas, hire_date, notes, created_by)
        VALUES (emp_id, t, e.user_id, e.name, e.job, e.phone, e.base, round(e.base * 0.25), 50000, ec,
                (now() AT TIME ZONE zone)::date - 400, 'DEMO', owner_id);
        month_start := date_trunc('month', (now() AT TIME ZONE zone))::date;
        FOR i IN 0..2 LOOP
            m := (month_start - make_interval(months => 2 - i))::date;
            base := e.base;
            ot := CASE WHEN i = 1 THEN 30000 ELSE 0 END;
            bonus := CASE WHEN i = 0 AND e.user_id IS NOT NULL THEN 50000 ELSE 0 END;
            ded := CASE WHEN i = 1 AND e.user_id IS NULL THEN 20000 ELSE 0 END;
            net := base + allow + ot + bonus - ded;
            v_status := CASE WHEN i < 2 THEN 'PAID' WHEN e.user_id IS NULL THEN 'PARTIALLY_PAID' ELSE 'PENDING' END;
            paid := CASE v_status WHEN 'PAID' THEN net WHEN 'PARTIALLY_PAID' THEN round(net / 2.0) ELSE 0 END;
            rec_id := gen_random_uuid();
            INSERT INTO salary_records (id, tenant_id, employee_id, period, base_halalas, allowances_halalas,
                                        overtime_halalas, bonus_halalas, deductions_halalas, employer_cost_halalas,
                                        net_halalas, paid_halalas, status, notes, created_by)
            VALUES (rec_id, t, emp_id, m, base, allow, ot, bonus, ded, ec, net, paid, v_status,
                    CASE WHEN ot > 0 THEN 'ساعات إضافية' WHEN bonus > 0 THEN 'مكافأة أداء' END, owner_id);
            IF paid > 0 THEN
                INSERT INTO salary_payments (id, tenant_id, salary_record_id, amount_halalas, method, reference, paid_at, created_by)
                VALUES (gen_random_uuid(), t, rec_id, paid, 'BANK_TRANSFER', 'SAL-' || to_char(m, 'YYYYMM'),
                        least(now(), ((m + interval '1 month' - interval '2 days')::date + time '10:00') AT TIME ZONE zone), owner_id);
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Demo billing added: % invoices, 5 quotes, 4 promo codes, payroll for the demo team', n;
END $$;
