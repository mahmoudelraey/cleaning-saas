-- A photo per service, shown on the service cards of the company's public page. Empty = the portal shows a
-- default picture chosen from the service's name.
ALTER TABLE services ADD COLUMN image_key VARCHAR(300);
