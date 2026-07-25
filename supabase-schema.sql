-- Forge cloud backup schema — no accounts; every row is scoped by `owner`,
-- which is either a private key-derived bucket (the default for new installs)
-- or the legacy shared bucket. Run once in the Supabase SQL Editor.
--
-- This script is idempotent and non-destructive: it creates what's missing and
-- leaves existing rows alone, so it is safe to re-run against a project that
-- already holds training history.

create table if not exists sessions (
  uuid uuid primary key,
  owner text not null,
  day_type text not null,
  started_at bigint not null,
  finished_at bigint,
  entries jsonb not null,
  -- Client write time (ms epoch) — drives last-write-wins sync of edits.
  updated_at bigint,
  -- Soft-delete tombstone (ms epoch); non-null rows are hidden client-side.
  deleted_at bigint
);

-- Pre-session readiness rating ('fresh' | 'normal' | 'beat'), if the trainee
-- was asked. Nullable: sessions logged without the check simply have none.
alter table sessions add column if not exists readiness text;

create index if not exists sessions_owner_idx on sessions (owner);

-- Everything that isn't a session: custom exercises, custom days, goals, and
-- bodyweight readings. One generic table rather than four bespoke ones — the
-- client reconciles them all through the same last-write-wins path, and adding
-- a record type needs no migration here.
create table if not exists records (
  owner text not null,
  -- 'exercise' | 'day' | 'goal' | 'bodyweight'
  kind text not null,
  -- The record's own id, unique within its kind.
  id text not null,
  payload jsonb not null,
  updated_at bigint,
  deleted_at bigint,
  primary key (owner, kind, id)
);

create table if not exists settings (
  owner text primary key,
  bar_weight_kg numeric not null default 20,
  plates_kg jsonb not null default '[25,20,15,10,5,2.5,1.25]',
  sound_on boolean not null default true,
  updated_at timestamptz not null default now()
);

-- The whole settings object travels as JSON, so a new setting (weekly plan,
-- readiness check, training block…) is a client change rather than a schema
-- migration. The three named columns above are kept in step on every write so a
-- device still running an older bundle keeps reading sensible values.
-- `updated_ms` is the client's ms-epoch write time; the legacy `updated_at`
-- column is a server timestamp of a different type, hence the separate name.
alter table settings add column if not exists payload jsonb;
alter table settings add column if not exists updated_ms bigint;

-- The app talks to these with the public anon key and no login, so the anon
-- role needs read/write. Protection is the `owner` value itself: new installs
-- generate a random key and address a bucket derived from sha256(key), so the
-- bucket name is not guessable and never ships in the bundle. The key is only
-- ever hashed client-side — the server never sees it. Installs predating this
-- stay on the shared `forge-owner` bucket until they opt in (Setup → Cloud
-- Backup), because re-keying them silently would orphan their history.
alter table sessions enable row level security;
alter table records enable row level security;
alter table settings enable row level security;

drop policy if exists "anon full access to sessions" on sessions;
create policy "anon full access to sessions" on sessions
  for all to anon using (true) with check (true);

drop policy if exists "anon full access to records" on records;
create policy "anon full access to records" on records
  for all to anon using (true) with check (true);

drop policy if exists "anon full access to settings" on settings;
create policy "anon full access to settings" on settings
  for all to anon using (true) with check (true);
