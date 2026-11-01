-- A trial must always have an end date. Without it the row is ambiguous; the app treats it as expired,
-- and the database now refuses to store it at all.
UPDATE tenants SET trial_ends_at = created_at + INTERVAL '14 days'
WHERE status = 'TRIAL' AND trial_ends_at IS NULL;

ALTER TABLE tenants
    ADD CONSTRAINT ck_tenants_trial_has_end CHECK (status <> 'TRIAL' OR trial_ends_at IS NOT NULL);
