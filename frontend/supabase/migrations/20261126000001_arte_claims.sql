-- "Sumate" on the public scene pages: people behind a space or a person asking to co-author their entry.
-- Written only by the server (service role); RLS on with no policy keeps it closed to the public keys.
create table if not exists arte_claims (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references nodes(id) on delete set null,
  name text not null,
  email text not null,
  role text,
  message text,
  created_at timestamptz not null default now()
);
alter table arte_claims enable row level security;
