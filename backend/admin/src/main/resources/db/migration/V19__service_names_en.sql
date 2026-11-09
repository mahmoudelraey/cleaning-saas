-- English names for services and add-ons. `name` / `description` stay the Arabic (main) text; the portal and
-- admin show the English one when the reader uses English and it is filled in.
ALTER TABLE services
    ADD COLUMN name_en        VARCHAR(150),
    ADD COLUMN description_en VARCHAR(1000);
ALTER TABLE service_addons
    ADD COLUMN name_en VARCHAR(150);
