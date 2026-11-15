-- Which catalog service / add-on a quote or invoice line came from (null for free-text lines). Lets an accepted
-- quote carry its agreed prices back to the booking's items. No foreign key: services are archived, never deleted.
ALTER TABLE document_lines
    ADD COLUMN service_id UUID,
    ADD COLUMN addon_id   UUID;
