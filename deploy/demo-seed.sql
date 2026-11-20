-- FieldOps demo data for screenshots / marketing videos.
-- Fills ONE company with: 6 services (one with size options), 4 technicians, 12 customers in Riyadh,
-- about 26 bookings from a week ago to a week ahead (no Fridays) (completed, today in progress / on the way, upcoming),
-- reviews on completed visits and this month's expenses.
-- Everything it creates is tagged so demo-cleanup.sql can remove it.
-- Technicians sign in with their phone and the password  Demo@12345
--
-- Plain SQL: run it as one statement in any SQL console (IntelliJ, DBeaver, pgAdmin, psql), connected as the
-- database owner (user fieldops). It is all-or-nothing: on any error nothing is saved.
-- To fill another company, change the id on the line "t uuid := ...".

DO $$
DECLARE
    t        uuid := '44e21a02-426b-4567-8c69-54c02f6dbb48';
    zone     text;
    owner_id uuid;
    riyadh   int;
    -- services
    s_apt uuid := gen_random_uuid(); s_sofa uuid := gen_random_uuid(); s_ac uuid := gen_random_uuid();
    s_deep uuid := gen_random_uuid(); s_pest uuid := gen_random_uuid(); s_carpet uuid := gen_random_uuid();
    o_small uuid := gen_random_uuid(); o_mid uuid := gen_random_uuid(); o_big uuid := gen_random_uuid();
    svc   uuid[]; price bigint[]; dur int[];
    techs uuid[] := '{}';
    custs uuid[] := '{}'; addrs uuid[] := '{}';
    tech_names text[] := ARRAY['أحمد الزهراني', 'خالد العتيبي', 'محمد القحطاني', 'سعد الشهري'];
    tech_colors text[] := ARRAY['#0EA5A4', '#6366F1', '#F59E0B', '#EC4899'];
    cust_names text[] := ARRAY['عبدالله السبيعي', 'نورة الدوسري', 'فهد المطيري', 'سارة الحربي', 'ريم العنزي',
                               'ماجد الغامدي', 'هيفاء الشمري', 'تركي البقمي', 'منيرة الرشيد', 'بندر الخالدي',
                               'لمى الفيصل', 'يوسف العمري'];
    districts text[] := ARRAY['العليا', 'النرجس', 'الملقا', 'الياسمين', 'حطين', 'الصحافة',
                              'الربيع', 'قرطبة', 'الورود', 'المروج', 'النخيل', 'الغدير'];
    comments text[] := ARRAY['خدمة ممتازة والفريق محترم ووصلوا في الوقت', 'نظافة رائعة، أنصح فيهم',
                             'سرعة في التنفيذ وأسعار مناسبة', 'شغل مرتب جداً، شكراً لكم', 'تجربة ممتازة وبنتعامل معكم مرة ثانية'];
    pay text[] := ARRAY['CASH', 'MADA', 'BANK_TRANSFER', 'APPLE_PAY'];
    src text[] := ARRAY['MANUAL', 'PORTAL', 'PUBLIC_PAGE', 'MANUAL'];
    pwd text := '{bcrypt}$2a$10$ks0Oay77UWg3bNLi2JRh5e.v58uKNt5cx4x1mSFhdiJVNiy68.L8C';
    v_phone text; uid uuid; tid uuid; cid uuid; aid uuid; bid uuid;
    num bigint; i int; d int; k int; n int := 0; si int; si2 int;
    day date; st timestamptz; en timestamptz; status text; sub bigint; qty numeric;
    path text[]; prev text; step text;
BEGIN
    SELECT timezone INTO zone FROM tenants WHERE id = t;
    IF NOT FOUND THEN RAISE EXCEPTION 'Company % not found', t; END IF;
    zone := coalesce(zone, 'Asia/Riyadh');
    SELECT id INTO owner_id FROM users WHERE tenant_id = t AND role = 'OWNER' ORDER BY created_at LIMIT 1;
    SELECT id INTO riyadh FROM geo_cities WHERE name_en = 'Riyadh' LIMIT 1;

    -- ---------------------------------------------------------------- services
    INSERT INTO services (id, tenant_id, name, name_en, description, description_en, pricing_type,
                          base_price_halalas, cost_halalas, duration_min, created_by) VALUES
      (s_apt,    t, 'تنظيف شقة', 'Apartment cleaning', 'تنظيف شامل للغرف والمطبخ ودورات المياه',
                    'Full cleaning of rooms, kitchen and bathrooms', 'FIXED', 35000, 12000, 180, owner_id),
      (s_sofa,   t, 'غسيل كنب', 'Sofa washing', 'غسيل وتعقيم الكنب بالبخار', 'Steam washing and sanitising',
                    'FIXED', 20000, 6000, 90, owner_id),
      (s_ac,     t, 'صيانة وتنظيف مكيف', 'AC cleaning & maintenance', 'تنظيف الفلاتر وفحص الغاز',
                    'Filter cleaning and gas check', 'FIXED', 15000, 4500, 60, owner_id),
      (s_deep,   t, 'تنظيف عميق للفلل', 'Villa deep cleaning', 'تنظيف عميق للفلل قبل السكن',
                    'Move-in deep cleaning for villas', 'FIXED', 120000, 45000, 360, owner_id),
      (s_pest,   t, 'مكافحة حشرات', 'Pest control', 'رش آمن ومعتمد مع ضمان', 'Safe certified spraying with guarantee',
                    'FIXED', 25000, 8000, 90, owner_id),
      (s_carpet, t, 'غسيل سجاد', 'Carpet washing', 'غسيل السجاد بالمتر', 'Carpet washing per square metre',
                    'PER_SQM', 1500, 400, 60, owner_id);
    INSERT INTO service_options (id, tenant_id, service_id, name, name_en, price_halalas, duration_min, position, created_by) VALUES
      (o_small, t, s_apt, 'شقة صغيرة (غرفتين)', 'Small (2 rooms)', 35000, 180, 0, owner_id),
      (o_mid,   t, s_apt, 'شقة متوسطة (3 غرف)', 'Medium (3 rooms)', 45000, 240, 1, owner_id),
      (o_big,   t, s_apt, 'شقة كبيرة (4+ غرف)', 'Large (4+ rooms)', 60000, 300, 2, owner_id);
    svc   := ARRAY[s_apt, s_sofa, s_ac, s_deep, s_pest, s_carpet];
    price := ARRAY[45000::bigint, 20000, 15000, 120000, 25000, 1500];
    dur   := ARRAY[240, 90, 60, 360, 90, 60];

    -- ---------------------------------------------------------------- technicians
    FOR i IN 1..4 LOOP
        LOOP
            v_phone := '+96650' || lpad((floor(random() * 10000000))::int::text, 7, '0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.phone = v_phone);
        END LOOP;
        uid := gen_random_uuid(); tid := gen_random_uuid();
        INSERT INTO users (id, tenant_id, name, phone, email, password_hash, role, created_by)
        VALUES (uid, t, tech_names[i], v_phone, 'demo.tech' || i || '.' || left(t::text, 8) || '@example.com', pwd,
                'TECHNICIAN', owner_id);
        INSERT INTO technicians (id, tenant_id, user_id, skills, work_hours, color, created_by)
        VALUES (tid, t, uid,
                to_jsonb(ARRAY[svc[1 + (i - 1) % 6]::text, svc[1 + i % 6]::text, svc[1 + (i + 1) % 6]::text, s_apt::text]),
                '[{"day":"SUNDAY","start":"08:00","end":"18:00"},{"day":"MONDAY","start":"08:00","end":"18:00"},
                  {"day":"TUESDAY","start":"08:00","end":"18:00"},{"day":"WEDNESDAY","start":"08:00","end":"18:00"},
                  {"day":"THURSDAY","start":"08:00","end":"18:00"},{"day":"SATURDAY","start":"10:00","end":"16:00"}]'::jsonb,
                tech_colors[i], owner_id);
        techs := techs || tid;
    END LOOP;

    -- ---------------------------------------------------------------- customers + addresses
    FOR i IN 1..12 LOOP
        LOOP
            v_phone := '+96655' || lpad((floor(random() * 10000000))::int::text, 7, '0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM customers c WHERE c.tenant_id = t AND c.phone = v_phone AND c.deleted_at IS NULL);
        END LOOP;
        cid := gen_random_uuid(); aid := gen_random_uuid();
        INSERT INTO customers (id, tenant_id, name, phone, notes, created_at, created_by)
        VALUES (cid, t, cust_names[i], v_phone, 'DEMO', now() - (i * interval '9 days'), owner_id);
        INSERT INTO addresses (id, tenant_id, customer_id, label, city, district, details, city_id, created_by)
        VALUES (aid, t, cid, 'المنزل', 'الرياض', districts[i],
                'حي ' || districts[i] || '، شارع ' || (10 + i * 3) || '، فيلا ' || (5 + i), riyadh, owner_id);
        custs := custs || cid; addrs := addrs || aid;
    END LOOP;

    -- ---------------------------------------------------------------- bookings (2 a day, -7 .. +7 days, no Fridays)
    SELECT coalesce(max(next_value), 1) INTO num FROM tenant_counters WHERE tenant_id = t AND name = 'booking';
    FOR d IN -7..7 LOOP
        day := (now() AT TIME ZONE zone)::date + d;
        CONTINUE WHEN extract(isodow FROM day) = 5;   -- Friday: day off
        FOR k IN 0..1 LOOP
            n := n + 1;
            si := 1 + (n * 5 + k) % 6;
            st := (day + CASE k WHEN 0 THEN time '09:00' ELSE time '14:00' END) AT TIME ZONE zone;
            en := st + make_interval(mins => least(dur[si], 240));
            status := CASE
                WHEN d < 0 AND n % 9 = 0 THEN 'CANCELLED'
                WHEN d < 0 THEN 'COMPLETED'
                WHEN d = 0 AND k = 0 THEN 'IN_PROGRESS'
                WHEN d = 0 THEN 'ON_THE_WAY'
                WHEN d IN (1, 2) THEN 'ASSIGNED'
                WHEN d >= 5 AND k = 1 THEN 'NEW'
                ELSE 'CONFIRMED' END;
            cid := custs[1 + (n - 1) % 12]; aid := addrs[1 + (n - 1) % 12];
            qty := CASE WHEN svc[si] = s_carpet THEN 12 ELSE 1 END;
            sub := price[si] * qty;
            si2 := CASE WHEN n % 3 = 0 THEN 1 + (si % 6) ELSE 0 END;   -- some bookings have a second service
            IF si2 > 0 AND svc[si2] <> s_carpet THEN sub := sub + price[si2]; ELSE si2 := 0; END IF;
            bid := gen_random_uuid();
            INSERT INTO bookings (id, tenant_id, number, customer_id, address_id, status, source, scheduled_start,
                                  scheduled_end, subtotal_halalas, notes, internal_notes, completed_at,
                                  payment_method, created_at, updated_at, created_by)
            VALUES (bid, t, num, cid, aid, status, src[1 + n % 4], st, en, sub,
                    CASE WHEN n % 4 = 0 THEN 'الرجاء الاتصال قبل الوصول' END, 'DEMO',
                    CASE WHEN status = 'COMPLETED' THEN en END,
                    CASE WHEN status = 'COMPLETED' THEN pay[1 + n % 4] END,
                    st - interval '2 days', CASE WHEN status = 'COMPLETED' THEN en ELSE st - interval '1 day' END,
                    owner_id);
            num := num + 1;
            INSERT INTO booking_items (id, tenant_id, booking_id, service_id, option_id, quantity, unit_price_halalas,
                                       total_halalas, position, created_by)
            VALUES (gen_random_uuid(), t, bid, svc[si], CASE WHEN svc[si] = s_apt THEN o_mid END, qty, price[si], price[si] * qty, 0, owner_id);
            IF si2 > 0 THEN
                INSERT INTO booking_items (id, tenant_id, booking_id, service_id, option_id, quantity, unit_price_halalas,
                                           total_halalas, position, created_by)
                VALUES (gen_random_uuid(), t, bid, svc[si2], CASE WHEN svc[si2] = s_apt THEN o_mid END, 1, price[si2], price[si2], 1, owner_id);
            END IF;
            IF status NOT IN ('NEW', 'CANCELLED') THEN
                INSERT INTO assignments (id, tenant_id, booking_id, technician_id, starts_at, ends_at, created_by)
                VALUES (gen_random_uuid(), t, bid, techs[1 + ((d + 7) * 2 + k) % 4], st, en, owner_id);
            END IF;

            -- visit history: created, then each status step up to the current one
            INSERT INTO visit_events (id, tenant_id, booking_id, type, to_status, actor_name, created_at, created_by)
            VALUES (gen_random_uuid(), t, bid, 'CREATED', 'NEW', 'النظام', st - interval '2 days', owner_id);
            path := CASE status
                WHEN 'COMPLETED'   THEN ARRAY['CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED']
                WHEN 'IN_PROGRESS' THEN ARRAY['CONFIRMED', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS']
                WHEN 'ON_THE_WAY'  THEN ARRAY['CONFIRMED', 'ASSIGNED', 'ON_THE_WAY']
                WHEN 'ASSIGNED'    THEN ARRAY['CONFIRMED', 'ASSIGNED']
                WHEN 'CONFIRMED'   THEN ARRAY['CONFIRMED']
                WHEN 'CANCELLED'   THEN ARRAY['CONFIRMED', 'CANCELLED']
                ELSE ARRAY[]::text[] END;
            prev := 'NEW';
            FOR i IN 1..coalesce(array_length(path, 1), 0) LOOP
                step := path[i];
                INSERT INTO visit_events (id, tenant_id, booking_id, type, from_status, to_status, actor_name, created_at, created_by)
                VALUES (gen_random_uuid(), t, bid, 'STATUS_CHANGED', prev, step,
                        CASE WHEN step IN ('ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED') THEN tech_names[1 + ((d + 7) * 2 + k) % 4] ELSE 'المنسق' END,
                        CASE step WHEN 'CONFIRMED' THEN st - interval '47 hours' WHEN 'ASSIGNED' THEN st - interval '46 hours'
                                  WHEN 'CANCELLED' THEN st - interval '20 hours' WHEN 'ON_THE_WAY' THEN st - interval '30 minutes'
                                  WHEN 'IN_PROGRESS' THEN st ELSE en END,
                        owner_id);
                prev := step;
            END LOOP;

            -- reviews on most completed visits
            IF status = 'COMPLETED' AND n % 5 <> 0 THEN
                INSERT INTO visit_reviews (id, tenant_id, booking_id, customer_id, rating, comment, published, created_at)
                VALUES (gen_random_uuid(), t, bid, cid, CASE WHEN n % 4 = 0 THEN 4 ELSE 5 END, comments[1 + n % 5], true, en + interval '3 hours');
            END IF;
        END LOOP;
    END LOOP;
    INSERT INTO tenant_counters (tenant_id, name, next_value) VALUES (t, 'booking', num)
    ON CONFLICT (tenant_id, name) DO UPDATE SET next_value = excluded.next_value;

    -- ---------------------------------------------------------------- expenses this month
    INSERT INTO expenses (id, tenant_id, category, amount_halalas, vat_halalas, spent_on, description, vendor, reference, created_by) VALUES
      (gen_random_uuid(), t, 'SUPPLIES',  172500, 22500, (now() AT TIME ZONE zone)::date - 10, 'مواد تنظيف ومعقمات', 'مؤسسة النظافة', 'DEMO', owner_id),
      (gen_random_uuid(), t, 'FUEL',       46000,  6000, (now() AT TIME ZONE zone)::date - 7,  'وقود سيارات الفنيين', 'محطة ساسكو', 'DEMO', owner_id),
      (gen_random_uuid(), t, 'EQUIPMENT', 345000, 45000, (now() AT TIME ZONE zone)::date - 5,  'ماكينة غسيل كنب بالبخار', 'متجر المعدات', 'DEMO', owner_id),
      (gen_random_uuid(), t, 'MARKETING',  92000, 12000, (now() AT TIME ZONE zone)::date - 3,  'إعلانات سناب شات', 'Snapchat', 'DEMO', owner_id),
      (gen_random_uuid(), t, 'RENT',      500000,     0, (now() AT TIME ZONE zone)::date - 12, 'إيجار المستودع', 'مالك العقار', 'DEMO', owner_id);

    RAISE NOTICE 'Demo data added: 6 services, 4 technicians, 12 customers, % bookings, reviews and 5 expenses', n;
END $$;
