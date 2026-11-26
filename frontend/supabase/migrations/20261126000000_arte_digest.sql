-- Weekly mail ("Lo nuevo para vos"): when each call first appeared, and each artist's last mail and opt-out.
-- Re-runnable. The sync upserts programmes without naming first_seen_at, so the insert default is kept.
alter table arte_programs add column if not exists first_seen_at timestamptz;
-- rows that existed before this column are not "new": date them before the first mail
update arte_programs set first_seen_at = '2026-11-01' where first_seen_at is null;
alter table arte_programs alter column first_seen_at set default now();

alter table arte_profiles add column if not exists digest_opt_out boolean not null default false;
alter table arte_profiles add column if not exists digest_sent_at timestamptz;

-- The sync deletes a listing's rows that a run did not see and inserts them again when they come back: kept here,
-- a call's first-seen date survives that, so the weekly mail never announces an old call as new.
create table if not exists arte_program_seen (id text primary key, first_seen_at timestamptz not null default now());
alter table arte_program_seen enable row level security;
insert into arte_program_seen (id, first_seen_at)
  select id, coalesce(first_seen_at, '2026-11-01') from arte_programs on conflict (id) do nothing;

create or replace function arte_program_first_seen() returns trigger language plpgsql as $$
begin
  insert into arte_program_seen (id) values (new.id) on conflict (id) do nothing;
  select s.first_seen_at into new.first_seen_at from arte_program_seen s where s.id = new.id;
  return new;
end $$;
drop trigger if exists arte_program_first_seen on arte_programs;
create trigger arte_program_first_seen before insert on arte_programs
  for each row execute function arte_program_first_seen();
