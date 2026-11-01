-- Automatic invoices via a durable flag instead of an in-memory event: completing a visit sets
-- invoice_state = PENDING in the same transaction, and a scheduled job issues the invoice. Nothing is lost
-- if the server restarts or is redeployed between the completion and the invoice.
ALTER TABLE bookings
    ADD COLUMN invoice_state    VARCHAR(10)  NOT NULL DEFAULT 'NONE'
        CHECK (invoice_state IN ('NONE', 'PENDING', 'ISSUED', 'FAILED')),
    ADD COLUMN invoice_attempts INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN invoice_next_at  TIMESTAMPTZ,
    ADD COLUMN invoice_error    VARCHAR(300);

CREATE INDEX ix_bookings_invoice_pending ON bookings (tenant_id, invoice_next_at) WHERE invoice_state = 'PENDING';

-- Bookings that already have a live invoice.
UPDATE bookings b SET invoice_state = 'ISSUED'
WHERE EXISTS (SELECT 1 FROM invoices i WHERE i.booking_id = b.id AND i.status <> 'VOID');

-- Visits completed in the last 7 days without an invoice (e.g. before automatic invoices existed), for
-- companies that keep automatic invoices on.
UPDATE bookings b SET invoice_state = 'PENDING'
FROM tenants t
WHERE t.id = b.tenant_id AND t.auto_invoice
  AND b.status = 'COMPLETED' AND b.invoice_state = 'NONE'
  AND b.completed_at > now() - INTERVAL '7 days';
