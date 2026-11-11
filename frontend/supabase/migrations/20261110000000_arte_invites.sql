-- Show invitations: the artist's own shows and who they already invited to each.
-- Messages are sent from the artist's own Gmail / Instagram; this only tracks who was invited.
create table if not exists arte_shows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  venue text,
  address text,
  when_text text,                      -- free text as the artist writes it: "jueves 12/11, 18 a 21 h"
  link text,
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_arte_shows_user on arte_shows (user_id);

create table if not exists arte_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id uuid not null references arte_shows(id) on delete cascade,
  key text not null,                   -- node:<uuid> | email:<addr> | ig:<handle>
  node_id uuid references nodes(id) on delete set null,
  name text not null default '',
  email text,
  instagram text,
  sent_at timestamptz default now(),
  unique (show_id, key)
);

alter table arte_shows enable row level security;
alter table arte_invites enable row level security;
drop policy if exists "arte_shows own rows" on arte_shows;
create policy "arte_shows own rows" on arte_shows for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "arte_invites own rows" on arte_invites;
-- an invite must belong to the user AND point at one of the user's own shows
create policy "arte_invites own rows" on arte_invites for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from arte_shows s where s.id = show_id and s.user_id = auth.uid()));

grant select, insert, update, delete on arte_shows, arte_invites to authenticated;
grant all on arte_shows, arte_invites to service_role;
