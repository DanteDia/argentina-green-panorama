-- Rate limit for reading who an artist follows on Instagram (up to 20 paid API pages): one slot per artist every
-- 10 minutes, claimed atomically like claim_arte_import. Kept apart from the profile import so one doesn't block the other.
alter table arte_imports add column if not exists follows_at timestamptz;

create or replace function claim_arte_follows() returns boolean
language sql security definer set search_path = public as $$
  with claimed as (
    insert into arte_imports (user_id, last_at, follows_at) values (auth.uid(), 'epoch', now())
    on conflict (user_id) do update set follows_at = now()
      where arte_imports.follows_at is null or arte_imports.follows_at < now() - interval '10 minutes'
    returning 1
  )
  select exists (select 1 from claimed);
$$;
revoke all on function claim_arte_follows() from public, anon;
grant execute on function claim_arte_follows() to authenticated;
