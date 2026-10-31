-- Graph baseline: the shared nodes/edges tables every industry cluster uses.
-- Idempotent: on the production database (which already has these) it only adds what is missing;
-- on a fresh local database it creates them. Mirrors backend/seed/schema.sql + migrations v2/v3/industries.

create extension if not exists pgcrypto;

create table if not exists nodes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  link text,
  followers integer,
  cluster text not null default 'otros',
  categoria text,
  quien_fondea text,
  aliados_portfolio text[] default '{}',
  clientes text[] default '{}',
  descripcion text,
  logo_url text,
  verified boolean default false,
  verification_status text default 'unverified',
  source text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table nodes add column if not exists contact_info jsonb default '{}';
alter table nodes add column if not exists region text;
alter table nodes add column if not exists industry text;
alter table nodes add column if not exists discovery_method text default 'manual';
alter table nodes add column if not exists industries text[] not null default array['green']::text[];
-- stable id from the producing pipeline (e.g. escena-arte slug 'org:barro'); lets syncs upsert
alter table nodes add column if not exists external_id text;
alter table nodes add column if not exists extra jsonb default '{}';
create unique index if not exists idx_nodes_external_id on nodes (external_id) where external_id is not null;
create index if not exists idx_nodes_industries_gin on nodes using gin (industries);

create table if not exists edges (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references nodes(id) on delete cascade,
  target_id uuid references nodes(id) on delete cascade,
  relationship_type text not null,
  description text,
  confidence float default 1.0,
  source text default 'manual',
  verified boolean default false,
  created_at timestamptz default now()
);
alter table edges add column if not exists discovery_method text default 'manual';
alter table edges add column if not exists fecha text;
create unique index if not exists idx_edges_triple on edges (source_id, target_id, relationship_type);
create index if not exists idx_edges_source on edges (source_id);
create index if not exists idx_edges_target on edges (target_id);

alter table nodes enable row level security;
alter table edges enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nodes' and policyname = 'Public read access for nodes') then
    create policy "Public read access for nodes" on nodes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'edges' and policyname = 'Public read access for edges') then
    create policy "Public read access for edges" on edges for select using (true);
  end if;
end $$;
