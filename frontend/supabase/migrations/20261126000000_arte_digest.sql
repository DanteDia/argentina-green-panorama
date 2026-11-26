-- Weekly mail ("Lo nuevo para vos"): when each call first appeared, and each artist's last mail and opt-out.
-- Re-runnable. The sync upserts programmes without naming first_seen_at, so the insert default is kept.
alter table arte_programs add column if not exists first_seen_at timestamptz;
-- rows that existed before this column are not "new": date them before the first mail
update arte_programs set first_seen_at = '2026-11-01' where first_seen_at is null;
alter table arte_programs alter column first_seen_at set default now();

alter table arte_profiles add column if not exists digest_opt_out boolean not null default false;
alter table arte_profiles add column if not exists digest_sent_at timestamptz;
