-- English versions of the remaining public texts: promises, service areas, working hours and the address.
ALTER TABLE tenants
    ADD COLUMN page_promises_en VARCHAR(1000),
    ADD COLUMN page_areas_en    VARCHAR(300),
    ADD COLUMN page_hours_en    VARCHAR(150),
    ADD COLUMN address_en       VARCHAR(300);
