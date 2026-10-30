-- Rate-limit slots are claimed atomically on the server; clients can read but never write their own row
-- (otherwise a user could reset last_at through PostgREST and bypass the limit).
revoke insert, update, delete on arte_imports from authenticated;
drop policy if exists "arte_imports own rows" on arte_imports;
drop policy if exists "arte_imports read own" on arte_imports;
create policy "arte_imports read own" on arte_imports for select using (user_id = auth.uid());

-- true = slot granted (no import in the last 10 minutes); false = rate limited. Concurrency-safe via the PK upsert.
create or replace function claim_arte_import() returns boolean
language sql security definer set search_path = public as $$
  with claimed as (
    insert into arte_imports (user_id, last_at) values (auth.uid(), now())
    on conflict (user_id) do update set last_at = now()
      where arte_imports.last_at < now() - interval '10 minutes'
    returning 1
  )
  select exists (select 1 from claimed);
$$;
revoke all on function claim_arte_import() from public, anon;
grant execute on function claim_arte_import() to authenticated;
