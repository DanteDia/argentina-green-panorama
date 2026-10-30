-- One row per artist: when they last ran the onboarding import (rate limit for the paid Instagram API).
create table if not exists arte_imports (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_at timestamptz not null default now()
);
alter table arte_imports enable row level security;
drop policy if exists "arte_imports own rows" on arte_imports;
create policy "arte_imports own rows" on arte_imports for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on arte_imports to authenticated;
grant all on arte_imports to service_role;
