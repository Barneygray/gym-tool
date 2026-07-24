-- Forge cloud backup schema — no accounts, single shared bucket keyed by `owner`.
-- Run once in the Supabase SQL Editor. Safe to re-run: it drops and recreates
-- the two tables (they hold only backup data, restored from your devices).

drop table if exists sessions;
drop table if exists settings;

create table sessions (
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

create table settings (
  owner text primary key,
  bar_weight_kg numeric not null default 20,
  plates_kg jsonb not null default '[25,20,15,10,5,2.5,1.25]',
  sound_on boolean not null default true,
  updated_at timestamptz not null default now()
);

-- The app talks to these with the public anon key and no login, so allow the
-- anon role to read/write. (Personal single-user app; protection is the
-- unlisted app URL.)
alter table sessions enable row level security;
alter table settings enable row level security;

create policy "anon full access to sessions" on sessions
  for all to anon using (true) with check (true);

create policy "anon full access to settings" on settings
  for all to anon using (true) with check (true);
