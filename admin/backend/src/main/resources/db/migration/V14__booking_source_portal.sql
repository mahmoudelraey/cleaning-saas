-- Bookings made by signed-in customers in the customer portal (portal/ app, same database).
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_source_check CHECK (source IN ('MANUAL', 'PUBLIC_PAGE', 'PORTAL'));
