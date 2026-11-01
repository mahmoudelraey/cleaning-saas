-- Issue (and send) the invoice automatically when a visit is marked completed. On by default.
ALTER TABLE tenants ADD COLUMN auto_invoice BOOLEAN NOT NULL DEFAULT TRUE;
