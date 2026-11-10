-- The company's name in English, next to the Arabic one (tenants.name). Shown in the customer portal and the
-- admin app when English is chosen. Required at signup from now on; companies created before may leave it empty.
ALTER TABLE tenants ADD COLUMN name_en VARCHAR(150);
