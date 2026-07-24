-- Forge cloud backup schema. Run once in the Supabase SQL Editor.
--
-- There is no sign-in: the app carries a single fixed account key and every
-- device backs up / restores under it automatically. These tables are keyed by
-- that "account" string rather than by an authenticated user, and the policies
-- grant the public anon role access. That means anyone who inspected the app's
-- public code could read or write this data — an accepted trade for a personal
-- training log. If you'd rather lock it down, keep the repo/site private.

create table sessions (
  uuid uuid primary key,
  account text not null,
  day_type text not null,
  started_at bigint not null,
  finished_at bigint,
  entries jsonb not null,
  updated_at timestamptz not null default now()
);

create index sessions_account_idx on sessions (account);

alter table sessions enable row level security;

create policy "Anon backup access"
  on sessions for all
  to anon
  using (true)
  with check (true);

create table settings (
  account text primary key,
  bar_weight_kg numeric not null default 20,
  plates_kg jsonb not null default '[25,20,15,10,5,2.5,1.25]',
  sound_on boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;

create policy "Anon backup access"
  on settings for all
  to anon
  using (true)
  with check (true);
