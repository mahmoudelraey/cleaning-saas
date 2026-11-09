-- Screens a coordinator may open in the admin app, comma-separated (see Screen). NULL = the default set,
-- which is what coordinators could open before (everything except reports).
ALTER TABLE users ADD COLUMN screens VARCHAR(500);
