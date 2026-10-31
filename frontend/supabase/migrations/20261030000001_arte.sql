-- Arte cluster: career tool tables. User-owned rows are private (RLS by auth.uid());
-- programs and events are public read, written only by the service role (sync).

-- ---------- public reference data ----------
create table if not exists arte_programs (
  id text primary key,                 -- stable id from escena-arte
  name text not null,
  type text,                           -- Beca | Residencia | Premio | Convocatoria | ...
  discipline text,
  organizer text,
  country text,
  url text,
  description text,
  benefit text,
  eligibility jsonb not null default '{}',   -- nationality[], residence[], age_min, age_max, disciplines[], career_stage
  requirements jsonb not null default '{}',  -- letter, cv, images_n, pdf_pages_max, pdf_mb_max, video, budget, fee
  evidence jsonb not null default '{}',      -- field -> sentence of the call that justifies it
  opens_at date,
  closes_at date,
  status text,                         -- as computed by the pipeline; the app recomputes from dates
  window_text text,                    -- "anual; convocatoria ~ene–mar"
  digital_focus boolean default false,
  for_argentines text,
  alumni_text text,
  alumni_node_ids uuid[] default '{}',
  source text,
  verified_at date,
  updated_at timestamptz default now()
);
create index if not exists idx_arte_programs_closes on arte_programs (closes_at);

create table if not exists arte_events (
  id text primary key,
  title text not null,
  venue_node_id uuid references nodes(id) on delete set null,
  venue_name text,
  starts_on date,
  ends_on date,
  url text,
  image_url text,
  artists text[] default '{}',
  source text,
  updated_at timestamptz default now()
);
create index if not exists idx_arte_events_starts on arte_events (starts_on);

-- ---------- user-owned ----------
create table if not exists arte_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  node_id uuid references nodes(id) on delete set null,   -- the artist in the graph, when matched
  name text not null default '',
  slug text unique,
  birth_year int,
  birth_place text,
  base_city text,
  nationality text default 'AR',
  residence text default 'AR',
  website text,
  instagram text,
  email_public text,
  mediums text[] default '{}',
  themes text[] default '{}',
  career_stage text default 'emerging',         -- emerging | mid | established
  monthly_budget int default 2,                 -- applications per month the artist wants
  portfolio_public boolean default false,
  onboarded_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists arte_works (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  year text,
  technique text,
  dimensions text,
  series text,
  description text,
  images text[] default '{}',          -- storage paths
  sort int default 0,
  public boolean default false,
  source text default 'manual',
  created_at timestamptz default now()
);
create index if not exists idx_arte_works_user on arte_works (user_id, sort);

create table if not exists arte_cv_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('education','solo','group','prize','grant','residency','collection','press')),
  title text not null,
  org text,
  city text,
  country text,
  year text,
  link text,
  source text default 'manual',        -- manual | import | graph | application
  confirmed boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_arte_cv_user on arte_cv_items (user_id, kind);

create table if not exists arte_texts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bio_short','bio_long','statement','letter')),
  lang text not null default 'es',
  body text not null default '',
  application_id uuid,                 -- letters belong to an application
  version int not null default 1,
  created_at timestamptz default now()
);
create index if not exists idx_arte_texts_user on arte_texts (user_id, kind, lang);

create table if not exists arte_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id text not null references arte_programs(id),
  status text not null default 'idea' check (status in ('idea','preparing','sent','selected','rejected','withdrawn')),
  due_at date,
  notes text default '',
  dossier jsonb default '{}',          -- selected works, section overrides, template
  result text,
  result_at date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, program_id)
);

create table if not exists arte_application_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references arte_applications(id) on delete cascade,
  key text not null,
  label text not null,
  done boolean default false,
  due_at date,
  sort int default 0
);

create table if not exists arte_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                  -- new_match | deadline | event | info
  title text not null,
  body text,
  url text,
  read boolean default false,
  created_at timestamptz default now()
);

create table if not exists arte_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  handle text not null,
  full_name text,
  node_id uuid references nodes(id) on delete set null,
  created_at timestamptz default now(),
  primary key (user_id, handle)
);

-- ---------- RLS ----------
alter table arte_programs enable row level security;
alter table arte_events enable row level security;
create policy "arte_programs public read" on arte_programs for select using (true);
create policy "arte_events public read" on arte_events for select using (true);

do $$
declare t text;
begin
  foreach t in array array['arte_works','arte_cv_items','arte_texts','arte_applications','arte_application_items','arte_alerts','arte_follows'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "%s own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;

alter table arte_profiles enable row level security;
create policy "arte_profiles own row" on arte_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- public portfolio: anyone can read profiles that opted in
create policy "arte_profiles public portfolio" on arte_profiles for select using (portfolio_public);
create policy "arte_works public portfolio" on arte_works for select
  using (public and exists (select 1 from arte_profiles p where p.user_id = arte_works.user_id and p.portfolio_public));

-- ---------- storage ----------
insert into storage.buckets (id, name, public) values ('arte-private', 'arte-private', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('arte-public', 'arte-public', true) on conflict (id) do nothing;
create policy "arte-private own folder" on storage.objects for all
  using (bucket_id = 'arte-private' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'arte-private' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "arte-public own folder write" on storage.objects for insert
  with check (bucket_id = 'arte-public' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "arte-public read" on storage.objects for select using (bucket_id = 'arte-public');

-- ---------- grants (newer Supabase does not auto-grant table privileges; RLS above still filters rows) ----------
grant usage on schema public to anon, authenticated, service_role;
grant select on nodes, edges, arte_programs, arte_events to anon, authenticated;
grant select on arte_profiles, arte_works to anon;   -- rows limited by the public-portfolio policies
grant select, insert, update, delete on arte_profiles, arte_works, arte_cv_items, arte_texts, arte_applications,
  arte_application_items, arte_alerts, arte_follows to authenticated;
grant all on all tables in schema public to service_role;
