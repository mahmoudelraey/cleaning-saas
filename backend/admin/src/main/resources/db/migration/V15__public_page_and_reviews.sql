-- Company public page in the customer portal ({portal}/{slug}): owner-written content, and customer
-- ratings of completed visits that the owner can choose to show there.

ALTER TABLE tenants
    ADD COLUMN page_headline VARCHAR(120),
    ADD COLUMN page_about    VARCHAR(2000),
    ADD COLUMN page_areas    VARCHAR(300),
    ADD COLUMN page_hours    VARCHAR(150),
    ADD COLUMN whatsapp      VARCHAR(20),
    ADD COLUMN instagram     VARCHAR(60),
    ADD COLUMN x_handle      VARCHAR(60),
    ADD COLUMN snapchat      VARCHAR(60),
    ADD COLUMN tiktok        VARCHAR(60);

-- One rating per completed visit, written by that visit's customer. Only rows the owner publishes
-- appear as comments on the public page; the average and count always cover every rating.
CREATE TABLE visit_reviews (
    id          UUID PRIMARY KEY,
    tenant_id   UUID          NOT NULL REFERENCES tenants (id),
    booking_id  UUID          NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    customer_id UUID          NOT NULL REFERENCES customers (id),
    rating      SMALLINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     VARCHAR(1000),
    published   BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by  UUID
);
CREATE UNIQUE INDEX ux_visit_reviews_booking ON visit_reviews (booking_id);
CREATE INDEX ix_visit_reviews_tenant_created ON visit_reviews (tenant_id, created_at DESC);
CREATE INDEX ix_visit_reviews_published ON visit_reviews (tenant_id, published, created_at DESC);

ALTER TABLE visit_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON visit_reviews
    USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON visit_reviews TO fieldops_app;
