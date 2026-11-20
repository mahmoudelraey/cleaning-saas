-- FieldOps demo data, part 3: the customer portal (public company page, online booking, signed-in customer).
-- Run AFTER demo-seed.sql (and demo-seed-billing.sql for invoices/quotes in the customer's account).
-- Plain SQL: run it as one statement in any SQL console (IntelliJ, DBeaver, pgAdmin, psql) as user fieldops.
--
-- Adds / sets:
--   * public page text in Arabic and English (headline, about, areas, hours, promises, founded year, team size),
--     contact details and social accounts. ONLY fields that are still empty are filled: your own text stays.
--   * online booking switched on, with a short note on the booking page
--   * 4 contact requests from customers (2 new, 2 handled)
--   * optional: puts YOUR mobile on the first demo customer, so you can sign in to the portal with the code you
--     receive and screenshot "my bookings", invoices and quotes. Set my_phone below (05XXXXXXXX), or leave empty.
--
-- The portal is at https://<your domain>/<company slug>  (e.g. https://field-ops.duckdns.org/my-company)

DO $$
DECLARE
    t         uuid := '44e21a02-426b-4567-8c69-54c02f6dbb48';
    my_phone  text := '';            -- e.g. '0551234567' to sign in to the portal as a demo customer
    e164      text;
    owner_id  uuid;
    c1        record;
    c         record;
    i         int := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = t) THEN RAISE EXCEPTION 'Company % not found', t; END IF;
    SELECT id INTO owner_id FROM users WHERE tenant_id = t AND role = 'OWNER' ORDER BY created_at LIMIT 1;

    -- ---------------------------------------------------------------- public page (only empty fields)
    UPDATE tenants SET
        name_en             = coalesce(nullif(name_en, ''), 'Lamaa Cleaning'),
        page_hero_title     = coalesce(nullif(page_hero_title, ''), 'بيتك يلمع… ونحن نهتم بالتفاصيل'),
        page_hero_title_en  = coalesce(nullif(page_hero_title_en, ''), 'A sparkling home, with care for every detail'),
        page_headline       = coalesce(nullif(page_headline, ''), 'تنظيف وصيانة منزلية في الرياض بفريق محترف ومواعيد دقيقة'),
        page_headline_en    = coalesce(nullif(page_headline_en, ''), 'Home cleaning and maintenance in Riyadh by a professional team, always on time'),
        page_about          = coalesce(nullif(page_about, ''),
            'نقدم خدمات تنظيف الشقق والفلل، غسيل الكنب والسجاد، صيانة المكيفات ومكافحة الحشرات. '
            || 'فريقنا مدرب ومجهز بأحدث المعدات، ونستخدم مواد آمنة على العائلة. احجز موعدك أونلاين وتابع الفني لحظة بلحظة.'),
        page_about_en       = coalesce(nullif(page_about_en, ''),
            'We clean apartments and villas, wash sofas and carpets, service AC units and handle pest control. '
            || 'Our trained team uses modern equipment and family-safe products. Book online and follow your technician in real time.'),
        page_areas          = coalesce(nullif(page_areas, ''), 'العليا، النرجس، الملقا، الياسمين، حطين، الصحافة، الربيع، قرطبة'),
        page_areas_en       = coalesce(nullif(page_areas_en, ''), 'Olaya, Narjis, Malqa, Yasmin, Hittin, Sahafa, Rabi, Qurtubah'),
        page_hours          = coalesce(nullif(page_hours, ''), 'السبت – الخميس، 8 صباحاً – 10 مساءً'),
        page_hours_en       = coalesce(nullif(page_hours_en, ''), 'Saturday – Thursday, 8 AM – 10 PM'),
        page_promises       = coalesce(nullif(page_promises, ''),
            E'فريق مدرب وموثوق\nمواد تنظيف آمنة على الأطفال\nالالتزام بالموعد أو خصم على الزيارة\nضمان إعادة الخدمة خلال 48 ساعة'),
        page_promises_en    = coalesce(nullif(page_promises_en, ''),
            E'Trained, trusted team\nChild-safe cleaning products\nOn time, or a discount on your visit\nFree redo within 48 hours'),
        page_founded_year   = coalesce(page_founded_year, 2019),
        page_team_size      = coalesce(page_team_size, 12),
        address             = coalesce(nullif(address, ''), 'الرياض، حي العليا، طريق الملك فهد'),
        address_en          = coalesce(nullif(address_en, ''), 'King Fahd Road, Olaya, Riyadh'),
        phone               = coalesce(nullif(phone, ''), '+966112345678'),
        whatsapp            = coalesce(nullif(whatsapp, ''), '+966551234567'),
        instagram           = coalesce(nullif(instagram, ''), 'lamaa.cleaning'),
        snapchat            = coalesce(nullif(snapchat, ''), 'lamaa.cleaning'),
        tiktok              = coalesce(nullif(tiktok, ''), 'lamaa.cleaning'),
        x_handle            = coalesce(nullif(x_handle, ''), 'lamaa_cleaning'),
        booking_page_enabled = true,
        booking_page_note   = coalesce(nullif(booking_page_note, ''), 'نؤكد موعدك خلال ساعة عبر واتساب. الدفع بعد انتهاء الخدمة.')
    WHERE id = t;

    -- ---------------------------------------------------------------- contact requests
    FOR c IN SELECT id, name, phone FROM customers WHERE tenant_id = t AND notes = 'DEMO' ORDER BY created_at LIMIT 4 LOOP
        i := i + 1;
        INSERT INTO contact_messages (id, tenant_id, customer_id, name, phone, email, topic, message, status,
                                      handled_by, handled_at, created_at)
        VALUES (gen_random_uuid(), t, c.id, c.name, c.phone, 'demo.contact@example.com',
                (ARRAY['QUOTE', 'QUESTION', 'BOOKING', 'OTHER'])[i],
                (ARRAY['أبغى عرض سعر لتنظيف فيلا دورين قبل السكن، المساحة تقريباً 400 متر',
                       'هل عندكم خدمة تعقيم للخزانات؟ وكم السعر؟',
                       'أبغى أغير موعد الزيارة من الصباح للمساء إذا ممكن',
                       'شكراً على الخدمة الممتازة، الفني كان محترم جداً'])[i],
                CASE WHEN i <= 2 THEN 'NEW' ELSE 'DONE' END,
                CASE WHEN i > 2 THEN owner_id END,
                CASE WHEN i > 2 THEN now() - make_interval(hours => i * 5) END,
                now() - make_interval(hours => i * 9));
    END LOOP;

    -- ---------------------------------------------------------------- portal sign-in as a demo customer
    IF btrim(my_phone) <> '' THEN
        e164 := regexp_replace(btrim(my_phone), '\D', '', 'g');
        e164 := CASE WHEN e164 LIKE '05%' THEN '+966' || substr(e164, 2)
                     WHEN e164 LIKE '9665%' THEN '+' || e164
                     WHEN e164 LIKE '5%' AND length(e164) = 9 THEN '+966' || e164
                     ELSE NULL END;
        IF e164 IS NULL OR e164 !~ '^\+9665\d{8}$' THEN
            RAISE EXCEPTION 'my_phone must be a Saudi mobile like 05XXXXXXXX';
        END IF;
        IF EXISTS (SELECT 1 FROM customers WHERE tenant_id = t AND phone = e164 AND deleted_at IS NULL AND notes <> 'DEMO') THEN
            RAISE EXCEPTION 'A real customer already uses %; sign in with that customer instead', e164;
        END IF;
        UPDATE customers SET phone = e164 WHERE tenant_id = t AND notes = 'DEMO' AND phone = e164;  -- already set: no-op
        SELECT id, name INTO c1 FROM customers WHERE tenant_id = t AND notes = 'DEMO' ORDER BY created_at DESC LIMIT 1;
        UPDATE customers SET phone = e164 WHERE id = c1.id
          AND NOT EXISTS (SELECT 1 FROM customers x WHERE x.tenant_id = t AND x.phone = e164 AND x.deleted_at IS NULL);
        RAISE NOTICE 'Portal: sign in with % to see % bookings, invoices and quotes', my_phone, c1.name;
    END IF;

    RAISE NOTICE 'Demo portal added: public page text (empty fields only), online booking on, % contact requests', i;
END $$;
