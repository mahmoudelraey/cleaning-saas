-- How the customer will pay for the visit (chosen when booking; shown on the order and used as the
-- default when recording the invoice payment). Optional: older bookings and booking-page orders have none.
ALTER TABLE bookings
    ADD COLUMN payment_method VARCHAR(20)
        CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'MADA', 'CARD', 'APPLE_PAY', 'ONLINE', 'OTHER'));
