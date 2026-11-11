-- Daily cap on AI drafts per artist (statement, bios, translations, tags, CV reading, letters). Sign-up is open and
-- every draft is a paid model call, so the counter is claimed atomically on the server; clients can only read their own.
create table if not exists arte_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  n int not null default 0,
  primary key (user_id, day)
);
alter table arte_ai_usage enable row level security;
drop policy if exists "arte_ai_usage read own" on arte_ai_usage;
create policy "arte_ai_usage read own" on arte_ai_usage for select using (user_id = auth.uid());
grant select on arte_ai_usage to authenticated;
grant all on arte_ai_usage to service_role;

-- true = one more draft granted today; false = the artist reached max_per_day. Concurrency-safe via the PK upsert.
create or replace function claim_arte_ai(max_per_day int default 40) returns boolean
language sql security definer set search_path = public as $$
  with claimed as (
    insert into arte_ai_usage (user_id, day, n)
    values (auth.uid(), (now() at time zone 'America/Argentina/Buenos_Aires')::date, 1)
    on conflict (user_id, day) do update set n = arte_ai_usage.n + 1
      where arte_ai_usage.n < least(greatest(max_per_day, 1), 40)   -- a caller can lower the cap, never raise it
    returning 1
  )
  select auth.uid() is not null and exists (select 1 from claimed);
$$;
revoke all on function claim_arte_ai(int) from public, anon;
grant execute on function claim_arte_ai(int) to authenticated;
