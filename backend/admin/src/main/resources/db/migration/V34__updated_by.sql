-- Who last changed each row (staff user id), next to created_by. NULL = changed by the system or a customer
-- (portal, public booking page, background jobs). Existing rows start with their creator.
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
        WHERE c.table_schema = current_schema() AND c.column_name = 'created_by' AND tb.table_type = 'BASE TABLE'
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns u
                          WHERE u.table_schema = c.table_schema AND u.table_name = c.table_name
                            AND u.column_name = 'updated_by')
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN updated_by UUID', t);
        EXECUTE format('UPDATE %I SET updated_by = created_by', t);
    END LOOP;
END
$$;
