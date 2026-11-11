-- What a residency or programme costs the artist, when its listing states it: 'funded' (the artist is paid or travel is
-- covered), 'free' (no fee), 'low' (a stated fee up to about a room's rent). Null when the listing does not say.
alter table arte_programs add column if not exists cost text check (cost in ('funded', 'free', 'low'));
