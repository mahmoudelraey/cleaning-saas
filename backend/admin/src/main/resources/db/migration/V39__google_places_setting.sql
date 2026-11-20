-- Google reviews are switched on or off for every company from Platform → Settings, with the Places API key
-- (stored encrypted like the message provider secrets). Off by default: nothing about Google is shown until the
-- platform owner switches it on. With no key saved, GOOGLE_PLACES_API_KEY from the environment is used.
ALTER TABLE platform_settings
    ADD COLUMN google_places_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN google_places_api_key VARCHAR(600);
