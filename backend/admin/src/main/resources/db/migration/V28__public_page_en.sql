-- English versions of the public page's headline and "about us" text (Arabic ones: page_headline, page_about).
ALTER TABLE tenants
    ADD COLUMN page_headline_en VARCHAR(120),
    ADD COLUMN page_about_en    VARCHAR(2000);
