-- Drop the "Service role full ..." policies.
--
-- They were meant for the service role, but a policy with no `TO` clause applies to every role,
-- so `FOR ALL USING (true)` let anyone holding the public anon key insert, update or delete rows.
-- The service role bypasses RLS and never needed them; public read policies stay in place.
--
-- Idempotent. Apply with: psql "$POSTGRES_URL_NON_POOLING" -v ON_ERROR_STOP=1 -f migration_drop_public_write.sql

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'Service role full%'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;
