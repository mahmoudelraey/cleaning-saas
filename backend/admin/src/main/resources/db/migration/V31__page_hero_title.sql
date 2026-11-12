-- The big title at the top of the company's public page (e.g. "A cleaner home. A better life."), in Arabic and
-- English. Empty means the portal's default title. A line break splits it into the two hero lines.
ALTER TABLE tenants ADD COLUMN page_hero_title VARCHAR(120);
ALTER TABLE tenants ADD COLUMN page_hero_title_en VARCHAR(120);
