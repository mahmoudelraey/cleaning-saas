-- About us page in the customer portal, and the company's Google Maps listing (for live Google ratings).
ALTER TABLE tenants
    ADD COLUMN page_founded_year SMALLINT CHECK (page_founded_year BETWEEN 1950 AND 2100),
    ADD COLUMN page_team_size    INTEGER  CHECK (page_team_size BETWEEN 1 AND 10000),
    -- "What you can expect": one promise per line.
    ADD COLUMN page_promises     VARCHAR(1000),
    -- Google Place ID (Places API). Only the ID is stored; ratings and reviews are fetched live from Google.
    ADD COLUMN google_place_id   VARCHAR(300),
    ADD COLUMN google_place_name VARCHAR(300);
