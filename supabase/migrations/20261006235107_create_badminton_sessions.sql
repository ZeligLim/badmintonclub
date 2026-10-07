create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  last_played_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  event_date date not null unique,
  starts_at time not null default time '18:00',
  duration_minutes smallint not null default 120,
  capacity smallint not null default 16,
  signup_opens_at timestamptz not null,
  confirmation_at timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'confirmed', 'closed')),
  created_at timestamptz not null default now(),
  constraint sessions_weekday_check
    check (extract(isodow from event_date) in (1, 3)),
  constraint sessions_schedule_check
    check (starts_at = time '18:00' and duration_minutes = 120),
  constraint sessions_capacity_check
    check (capacity in (4, 8, 12, 16)),
  constraint sessions_signup_schedule_check
    check (signup_opens_at < confirmation_at)
);

create table public.session_signups (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'selected', 'waitlisted', 'played', 'cancelled')),
  signed_up_at timestamptz not null default now(),
  slot_number smallint,
  primary key (session_id, user_id),
  constraint session_signups_slot_check
    check (
      (
        status in ('selected', 'played')
        and slot_number is not null
        and slot_number between 1 and 4
      )
      or (status not in ('selected', 'played') and slot_number is null)
    )
);

create index profiles_last_played_at_idx
  on public.profiles (last_played_at asc nulls first, id);
create index session_signups_user_session_idx
  on public.session_signups (user_id, session_id);
create index session_signups_selection_idx
  on public.session_signups (session_id, signed_up_at, user_id)
  where status = 'requested';
create index session_signups_roster_idx
  on public.session_signups (session_id, slot_number, signed_up_at)
  where status in ('selected', 'played');

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_signups enable row level security;

create policy "Profiles are visible to their owner"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users may update their own display name"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Session schedules are public"
  on public.sessions for select to anon, authenticated
  using (true);
create policy "Users may read their own signups"
  on public.session_signups for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.profiles, public.sessions, public.session_signups
  from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.sessions to anon, authenticated;
grant select on table public.session_signups to authenticated;
grant all on table public.profiles, public.sessions, public.session_signups to service_role;

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_display_name text;
begin
  v_display_name := nullif(
    btrim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, ''), '@', 1),
      'Player'
    )),
    ''
  );

  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(v_display_name, 'Player'), 80))
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.create_profile_for_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_profile_for_new_user();

create or replace function public.ensure_next_week_sessions()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_monday date;
  v_signup_opens_at timestamptz;
  v_event_date date;
begin
  v_monday := date_trunc('week', now() at time zone 'Europe/London')::date + 7;
  v_signup_opens_at := (v_monday - 4)::timestamp at time zone 'Europe/London';

  foreach v_event_date in array array[v_monday, v_monday + 2]
  loop
    insert into public.sessions (
      event_date,
      starts_at,
      duration_minutes,
      capacity,
      signup_opens_at,
      confirmation_at
    )
    values (
      v_event_date,
      time '18:00',
      120,
      16,
      v_signup_opens_at,
      ((v_event_date - 1)::timestamp + time '12:00') at time zone 'Europe/London'
    )
    on conflict (event_date) do nothing;
  end loop;
end;
$$;

create or replace function public.request_session_signup(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
  v_existing_status text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to join a session.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'This session is no longer open.';
  end if;
  if now() < v_session.signup_opens_at then
    raise exception using errcode = 'P0001', message = 'Sign-ups have not opened yet.';
  end if;
  if now() >= v_session.confirmation_at then
    raise exception using errcode = 'P0001', message = 'Sign-ups have closed for this session.';
  end if;

  select status into v_existing_status
  from public.session_signups
  where session_id = p_session_id and user_id = v_user_id;

  if found and v_existing_status <> 'cancelled' then
    raise exception using errcode = 'P0001', message = 'You already have a place or waitlist request.';
  end if;

  if found then
    update public.session_signups
    set status = 'requested', signed_up_at = now(), slot_number = null
    where session_id = p_session_id and user_id = v_user_id;
  else
    insert into public.session_signups (session_id, user_id)
    values (p_session_id, v_user_id);
  end if;
end;
$$;

create or replace function public.cancel_session_signup(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to cancel a session request.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'open' or now() >= v_session.confirmation_at then
    raise exception using errcode = 'P0001', message = 'This session can no longer be changed.';
  end if;

  update public.session_signups
  set status = 'cancelled', slot_number = null
  where session_id = p_session_id
    and user_id = v_user_id
    and status = 'requested';

  if not found then
    raise exception using errcode = 'P0001', message = 'No open signup request was found to cancel.';
  end if;
end;
$$;

create or replace function public.get_dashboard_sessions(
  p_from_date date,
  p_through_date date
)
returns table (
  id uuid,
  event_date date,
  day_name text,
  starts_at text,
  duration_minutes smallint,
  capacity smallint,
  registered_count bigint,
  signup_opens_at timestamptz,
  confirmation_at timestamptz,
  status text,
  current_user_status text,
  current_user_slot smallint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    session.id,
    session.event_date,
    case extract(isodow from session.event_date)
      when 1 then 'Monday'
      else 'Wednesday'
    end,
    to_char(session.starts_at, 'HH24:MI'),
    session.duration_minutes,
    session.capacity,
    count(signup.user_id) filter (
      where signup.status in ('requested', 'selected', 'played')
    ),
    session.signup_opens_at,
    session.confirmation_at,
    case
      when session.event_date < (now() at time zone 'Europe/London')::date then 'closed'
      else session.status
    end,
    max(signup.status) filter (where signup.user_id = (select auth.uid())),
    max(signup.slot_number) filter (where signup.user_id = (select auth.uid()))
  from public.sessions as session
  left join public.session_signups as signup on signup.session_id = session.id
  where session.event_date between p_from_date and p_through_date
  group by session.id
  order by session.event_date;
$$;

create or replace function public.get_session_roster(p_session_id uuid)
returns table (
  session_id uuid,
  slot_number smallint,
  user_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select signup.session_id, signup.slot_number, signup.user_id, profile.display_name
  from public.session_signups as signup
  join public.profiles as profile on profile.id = signup.user_id
  join public.sessions as session on session.id = signup.session_id
  where signup.session_id = p_session_id
    and (select auth.uid()) is not null
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    and signup.status in ('selected', 'played')
    and session.status = 'confirmed'
    and session.event_date between (now() at time zone 'Europe/London')::date
      and (now() at time zone 'Europe/London')::date + 14
  order by signup.slot_number, signup.signed_up_at, signup.user_id;
$$;

create or replace function public.check_in_to_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event_date date;
  v_starts_at time;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to check in to a session.';
  end if;

  select session.event_date, session.starts_at
  into v_event_date, v_starts_at
  from public.sessions as session
  join public.session_signups as signup on signup.session_id = session.id
  where session.id = p_session_id
    and session.status = 'confirmed'
    and signup.user_id = v_user_id
    and signup.status = 'selected'
  for update of session, signup;

  if not found then
    raise exception using errcode = 'P0001', message = 'Only a selected player can check in.';
  end if;
  if v_event_date >= (now() at time zone 'Europe/London')::date then
    raise exception using errcode = 'P0001', message = 'Check-in opens after the session day.';
  end if;

  update public.profiles
  set last_played_at = greatest(
    coalesce(last_played_at, '-infinity'::timestamptz),
    (v_event_date + v_starts_at) at time zone 'Europe/London'
  )
  where id = v_user_id;

  update public.session_signups
  set status = 'played'
  where session_id = p_session_id and user_id = v_user_id and status = 'selected';
end;
$$;

create or replace function public.finalize_due_sessions()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.sessions%rowtype;
  v_finalized_count integer := 0;
begin
  for v_session in
    select *
    from public.sessions
    where status = 'open'
      and confirmation_at <= now()
      and event_date > (now() at time zone 'Europe/London')::date
    order by confirmation_at, event_date
    for update skip locked
  loop
    with ranked_signups as (
      select
        signup.session_id,
        signup.user_id,
        row_number() over (
          order by profile.last_played_at asc nulls first,
            signup.signed_up_at asc,
            signup.user_id asc
        ) as priority
      from public.session_signups as signup
      join public.profiles as profile on profile.id = signup.user_id
      where signup.session_id = v_session.id
        and signup.status = 'requested'
    )
    update public.session_signups as signup
    set
      status = case
        when ranked.priority <= v_session.capacity then 'selected'
        else 'waitlisted'
      end,
      slot_number = case
        when ranked.priority <= v_session.capacity
          then ((ranked.priority - 1) / 4 + 1)::smallint
        else null
      end
    from ranked_signups as ranked
    where signup.session_id = ranked.session_id
      and signup.user_id = ranked.user_id;

    update public.sessions
    set status = 'confirmed'
    where id = v_session.id and status = 'open';

    v_finalized_count := v_finalized_count + 1;
  end loop;

  return v_finalized_count;
end;
$$;

revoke all on function public.ensure_next_week_sessions() from public, anon, authenticated;
revoke all on function public.request_session_signup(uuid) from public, anon, authenticated;
revoke all on function public.cancel_session_signup(uuid) from public, anon, authenticated;
revoke all on function public.get_dashboard_sessions(date, date) from public, anon, authenticated;
revoke all on function public.get_session_roster(uuid) from public, anon, authenticated;
revoke all on function public.check_in_to_session(uuid) from public, anon, authenticated;
revoke all on function public.finalize_due_sessions() from public, anon, authenticated;
grant execute on function public.ensure_next_week_sessions() to anon, authenticated;
grant execute on function public.request_session_signup(uuid) to authenticated;
grant execute on function public.cancel_session_signup(uuid) to authenticated;
grant execute on function public.get_dashboard_sessions(date, date) to anon, authenticated;
grant execute on function public.get_session_roster(uuid) to authenticated;
grant execute on function public.check_in_to_session(uuid) to authenticated;
grant execute on function public.finalize_due_sessions() to service_role;
