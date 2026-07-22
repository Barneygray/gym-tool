-- Forge cloud backup schema. Run once in the Supabase SQL Editor.

create table sessions (
  uuid uuid primary key,
  user_id uuid not null references auth.users(id) default auth.uid(),
  day_type text not null,
  started_at bigint not null,
  finished_at bigint,
  entries jsonb not null,
  updated_at timestamptz not null default now()
);

alter table sessions enable row level security;

create policy "Users manage their own sessions"
  on sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table settings (
  user_id uuid primary key references auth.users(id) default auth.uid(),
  bar_weight_kg numeric not null default 20,
  plates_kg jsonb not null default '[25,20,15,10,5,2.5,1.25]',
  sound_on boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;

create policy "Users manage their own settings"
  on settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
