-- The signup flow requires a confirmed playing level. Existing profiles have
-- already been using their stored level, and new profiles start on the club's
-- Intermediate default, so both receive an initial confirmation timestamp.
alter table public.profiles
  add column if not exists level_confirmed_at timestamptz not null default now();
