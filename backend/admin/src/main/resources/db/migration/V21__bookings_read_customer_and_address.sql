-- Bookings stop copying the customer and address: they are read through customer_id / address_id.
-- Booking items stop copying the service name: it is read from the service / add-on (Arabic and English).
-- Prices stay on the items (the price agreed at booking time).

-- 1. Addresses are archived instead of deleted, so a past visit always keeps its location.
ALTER TABLE addresses ADD COLUMN deleted_at TIMESTAMPTZ;

-- Row Level Security is FORCEd on these tables, which would also hide every row from this migration when the
-- login is not a superuser. Lift it for the data steps below and put it back at the end.
ALTER TABLE bookings  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE addresses NO FORCE ROW LEVEL SECURITY;

-- 2. Bookings whose address row was already deleted (address_id set to NULL) but kept the copied text: keep that
--    location as an archived address of the same customer and link the booking to it.
WITH orphan AS (
    SELECT id AS booking_id, gen_random_uuid() AS address_id
    FROM bookings
    WHERE address_id IS NULL AND (address_text IS NOT NULL OR address_lat IS NOT NULL OR address_map_url IS NOT NULL)
), archived AS (
    INSERT INTO addresses (id, tenant_id, customer_id, label, details, lat, lng, map_url, created_at, updated_at, deleted_at)
    SELECT o.address_id, b.tenant_id, b.customer_id, '', left(b.address_text, 500), b.address_lat, b.address_lng,
           b.address_map_url, b.created_at, now(), now()
    FROM orphan o JOIN bookings b ON b.id = o.booking_id
    RETURNING id
)
UPDATE bookings b SET address_id = o.address_id
FROM orphan o
WHERE b.id = o.booking_id AND EXISTS (SELECT 1 FROM archived a WHERE a.id = o.address_id);

ALTER TABLE bookings  FORCE ROW LEVEL SECURITY;
ALTER TABLE addresses FORCE ROW LEVEL SECURITY;

-- 3. Drop the copies.
ALTER TABLE bookings
    DROP COLUMN customer_name,
    DROP COLUMN customer_phone,
    DROP COLUMN address_text,
    DROP COLUMN address_lat,
    DROP COLUMN address_lng,
    DROP COLUMN address_map_url;

ALTER TABLE booking_items DROP COLUMN description;
