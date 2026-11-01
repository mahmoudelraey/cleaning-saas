-- Staff accounts created (or reset) by an owner get a temporary password that must be replaced at first login.
ALTER TABLE users
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN password_changed_at  TIMESTAMPTZ;
