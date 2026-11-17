-- Advanced level, one-time level confirmation, and a configurable matching
-- priority. Additive: existing sign-ups are untouched and existing timetables
-- keep the priority they were built with.

-- 1. Four playing levels, beginner default, one-way confirmation stamp.
alter table public.profiles drop constraint profiles_player_level_check;
alter table public.profiles add constraint profiles_player_level_check
  check (player_level in ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL'));
alter table public.profiles alter column player_level set default 'BEGINNER';
alter table public.profiles add column level_confirmed_at timestamptz;

-- 2. One place that decides what a level is worth in the draw.
create or replace function private.player_level_rank(p_level text)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'PROFESSIONAL' then 4
    when 'ADVANCED' then 3
    when 'INTERMEDIATE' then 2
    else 1
  end;
$$;
revoke all on function private.player_level_rank(text) from public, anon, authenticated;

-- 3. Members choose their own level, including the new one, and confirm it.
create or replace function public.update_my_player_level(p_player_level text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_can_choose_professional boolean;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to update your player level.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can update their level.';
  end if;

  select can_choose_professional
  into v_can_choose_professional
  from public.profiles
  where id = v_user_id;

  if p_player_level is null
    or p_player_level not in ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL')
    or (
      p_player_level = 'PROFESSIONAL'
      and not coalesce(v_can_choose_professional, false)
    ) then
    raise exception using
      errcode = '22023',
      message = 'Professional level is not available for this member.';
  end if;

  update public.profiles
  set player_level = p_player_level,
      level_confirmed_at = now()
  where id = v_user_id;
end;
$$;
revoke all on function public.update_my_player_level(text) from public, anon, authenticated;
grant execute on function public.update_my_player_level(text) to authenticated;

-- 4. Administrators may assign any of the four levels.
create or replace function public.admin_update_player_access(
  p_user_id uuid,
  p_player_level text,
  p_is_committee boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_email text;
begin
  select email into v_admin_email from auth.users where id = v_admin_id;
  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1 from public.profiles
      where id = v_admin_id and is_committee_admin
    ) then
    raise exception using errcode = '42501', message = 'Only a club administrator can change player access.';
  end if;
  if p_player_level is null
    or p_player_level not in ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL')
    or p_is_committee is null then
    raise exception using errcode = '22023', message = 'Select a valid player level.';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '22023', message = 'The selected player is not an eligible club member.';
  end if;

  update public.profiles
  set player_level = p_player_level,
      is_committee = p_is_committee
  where id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'The selected player profile was not found.';
  end if;
end;
$$;
revoke all on function public.admin_update_player_access(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_update_player_access(uuid, text, boolean) to authenticated;

-- 5. New sign-ups need a confirmed level. Existing rows are left alone.
create or replace function public.request_session_signup(
  p_session_id uuid,
  p_friend_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_session public.sessions%rowtype;
  v_existing_status text;
  v_display_name text;
  v_friend_ids uuid[] := coalesce(p_friend_ids, '{}'::uuid[]);
  v_is_committee boolean := false;
  v_signup_status text := 'requested';
  v_slot_number smallint;
  v_release_deadline timestamptz;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to join a session.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie email addresses can sign up for sessions.';
  end if;

  -- A member must confirm their playing level once before joining. Existing
  -- sign-ups are never touched: this only gates new ones.
  if not exists (
    select 1 from public.profiles
    where id = v_user_id and level_confirmed_at is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Confirm your playing level before signing up.';
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

  -- The timetable is released 30 minutes before the session. No join, whether
  -- the session is still open or already confirmed, may change the roster
  -- after this point.
  v_release_deadline := (v_session.event_date + v_session.starts_at)
                          at time zone 'Europe/London'
                          - interval '30 minutes';
  if now() >= v_release_deadline then
    raise exception using errcode = 'P0001', message = 'Sign-ups are locked. The timetable has already been released.';
  end if;

  v_display_name := left(
    nullif(btrim(split_part(coalesce((select auth.jwt()) ->> 'email', ''), '@', 1)), ''),
    80
  );
  insert into public.profiles (id, display_name)
  values (v_user_id, coalesce(v_display_name, 'Player'))
  on conflict (id) do nothing;

  select is_committee into v_is_committee
  from public.profiles
  where id = v_user_id;

  -- First-come-first-served sessions allocate a place straight away, and so
  -- do lottery sessions for committee members.
  if v_session.allocation_mode = 'fcfs' or v_is_committee then
    select available_slot.slot_number::smallint into v_slot_number
    from generate_series(1, (v_session.capacity + 3) / 4)
      as available_slot(slot_number)
    where (
      select count(*)
      from public.session_signups as signup
      where signup.session_id = p_session_id
        and signup.slot_number = available_slot.slot_number
        and signup.status in ('selected', 'played')
    ) < 4
    order by available_slot.slot_number
    limit 1;

    v_signup_status := case
      when v_slot_number is null then 'waitlisted'
      else 'selected'
    end;
  end if;

  select status into v_existing_status
  from public.session_signups
  where session_id = p_session_id and user_id = v_user_id;

  if found and v_existing_status <> 'cancelled' then
    raise exception using errcode = 'P0001', message = 'You already have a place or waitlist request.';
  end if;

  if found then
    update public.session_signups
    set status = v_signup_status,
        signed_up_at = now(),
        slot_number = v_slot_number
    where session_id = p_session_id and user_id = v_user_id;
  else
    insert into public.session_signups (
      session_id,
      user_id,
      status,
      slot_number
    )
    values (p_session_id, v_user_id, v_signup_status, v_slot_number);
  end if;

  delete from public.session_friend_preferences
  where session_id = p_session_id and user_id = v_user_id;

  insert into public.session_friend_preferences (
    session_id,
    user_id,
    friend_user_id
  )
  select p_session_id, v_user_id, selected_friend.friend_user_id
  from (
    select distinct friend_id as friend_user_id
    from unnest(v_friend_ids) as requested_friend(friend_id)
  ) as selected_friend
  join auth.users as friend_user on friend_user.id = selected_friend.friend_user_id
  join public.profiles as friend_profile on friend_profile.id = friend_user.id
  where selected_friend.friend_user_id <> v_user_id
    and private.is_club_email(friend_user.email);
end;
$$;
revoke all on function public.request_session_signup(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.request_session_signup(uuid, uuid[]) to authenticated;

-- 6. The fairness draw ranks the new level too.
create or replace function private.finalize_due_sessions()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_claim_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_session public.sessions%rowtype;
  v_finalized_count integer := 0;
  v_ranked_ids uuid[];
  v_selected_ids uuid[];
  v_existing_ids uuid[];
  v_selected_count integer;
begin
  -- The scheduled job calls this with the service key and no user session, so
  -- skip the member check for that role only. Every other caller still has to be
  -- a signed-in club member.
  if coalesce((select auth.role()), '') <> 'service_role' then
    if v_user_id is null
      or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
      or split_part(v_claim_email, '@', 2) <> 'atu.ie' then
      raise exception using
        errcode = '28000',
        message = 'Only @atu.ie email addresses can finalize sessions.';
    end if;
  end if;

  for v_session in
    select *
    from public.sessions
    where status = 'open'
      and confirmation_at <= now()
      and event_date >= (now() at time zone 'Europe/London')::date
    order by confirmation_at, event_date
    for update skip locked
  loop
    if v_session.allocation_mode = 'fcfs' then
      -- First-come-first-served sessions hand out places in signup order.
      select coalesce(
        array_agg(signup.user_id order by signup.signed_up_at, signup.user_id),
        '{}'::uuid[]
      )
      into v_ranked_ids
      from public.session_signups as signup
      where signup.session_id = v_session.id
        and signup.status = 'requested';
    else
      with recursive eligible_signups as (
        select
          signup.user_id,
          signup.signed_up_at,
          profile.last_played_at,
          profile.is_committee,
          profile.player_level
        from public.session_signups as signup
        join public.profiles as profile on profile.id = signup.user_id
        join auth.users as club_user on club_user.id = signup.user_id
        where signup.session_id = v_session.id
          and signup.status = 'requested'
          and private.is_club_email(club_user.email)
      ),
      friend_edges as (
        select preference.user_id as member_id, preference.friend_user_id as friend_id
        from public.session_friend_preferences as preference
        join eligible_signups as member on member.user_id = preference.user_id
        join eligible_signups as friend on friend.user_id = preference.friend_user_id
        where preference.session_id = v_session.id
          and member.is_committee = friend.is_committee
        union
        select preference.friend_user_id, preference.user_id
        from public.session_friend_preferences as preference
        join eligible_signups as member on member.user_id = preference.user_id
        join eligible_signups as friend on friend.user_id = preference.friend_user_id
        where preference.session_id = v_session.id
          and member.is_committee = friend.is_committee
      ),
      reach(origin_id, member_id) as (
        select user_id, user_id from eligible_signups
        union
        select reach.origin_id, friend_edges.friend_id
        from reach
        join friend_edges on friend_edges.member_id = reach.member_id
      ),
      component_map as (
        select origin_id as user_id, min(member_id::text)::uuid as group_id
        from reach
        group by origin_id
      ),
      group_freshness as (
        select
          component_map.group_id,
          max(eligible_signups.last_played_at) as effective_last_played_at
        from component_map
        join eligible_signups on eligible_signups.user_id = component_map.user_id
        group by component_map.group_id
      )
      select array_agg(eligible_signups.user_id order by
        eligible_signups.is_committee desc,
        group_freshness.effective_last_played_at asc nulls first,
        -- Within one fairness bucket the club ranks by playing level: a
        -- professional place is harder to replace than a beginner one. Ties on
        -- level still fall back to signup time, then the id.
        private.player_level_rank(eligible_signups.player_level) desc,
        eligible_signups.signed_up_at asc,
        eligible_signups.user_id asc
      )
      into v_ranked_ids
      from eligible_signups
      join component_map using (user_id)
      join group_freshness using (group_id);
    end if;

    v_ranked_ids := coalesce(v_ranked_ids, '{}'::uuid[]);

    select coalesce(
      array_agg(signup.user_id order by signup.slot_number, signup.signed_up_at, signup.user_id),
      '{}'::uuid[]
    )
    into v_existing_ids
    from public.session_signups as signup
    where signup.session_id = v_session.id
      and signup.status in ('selected', 'played');

    v_selected_count := least(
      cardinality(v_ranked_ids),
      greatest(v_session.capacity - cardinality(v_existing_ids), 0)
    );
    v_selected_ids := v_existing_ids
      || coalesce(v_ranked_ids[1:v_selected_count], '{}'::uuid[]);

    update public.session_signups as signup
    set
      status = case
        when signup.user_id = any(v_selected_ids) then 'selected'
        else 'waitlisted'
      end,
      slot_number = case
        when signup.user_id = any(v_selected_ids) then 1
        else null
      end
    where signup.session_id = v_session.id
      and signup.status = 'requested'
      and signup.user_id = any(v_ranked_ids);

    -- Court allocation is delegated to the shared set-based helper.
    perform private.assign_court_slots(v_session.id, v_selected_ids);

    update public.profiles as profile
    set last_played_at = greatest(
      coalesce(profile.last_played_at, '-infinity'::timestamptz),
      (v_session.event_date + v_session.starts_at) at time zone 'Europe/London'
    )
    from public.session_signups as signup
    where signup.session_id = v_session.id
      and signup.user_id = profile.id
      and signup.status = 'selected';

    update public.sessions
    set status = 'confirmed'
    where id = v_session.id and status = 'open';

    v_finalized_count := v_finalized_count + 1;
  end loop;

  return v_finalized_count;
end;
$$;
revoke all on function private.finalize_due_sessions() from public, anon, authenticated;

-- 7. Matching priority is a club setting, not a constant.
create table public.matching_settings (
  id boolean primary key default true check (id),
  priority text[] not null default array['committee', 'level', 'friends'],
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
insert into public.matching_settings default values on conflict do nothing;
alter table public.matching_settings enable row level security;
create policy "Club members can read matching settings"
  on public.matching_settings for select
  to authenticated
  using (
    exists (select 1 from public.profiles where profiles.id = (select auth.uid()))
  );
revoke all on public.matching_settings from public, anon, authenticated;
grant select on public.matching_settings to authenticated;

create or replace function public.admin_set_matching_priority(p_priority text[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
begin
  select email into v_admin_email from auth.users where id = v_admin_id;
  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1 from public.profiles
      where id = v_admin_id and is_committee_admin
    ) then
    raise exception using errcode = '42501', message = 'Only a club administrator can change the matching order.';
  end if;

  if p_priority is null
    or array_length(p_priority, 1) <> 3
    or (select count(distinct item) from unnest(p_priority) as item) <> 3
    or not (p_priority <@ array['committee', 'level', 'friends']) then
    raise exception using
      errcode = '22023',
      message = 'The matching order must list committee, level and friends once each.';
  end if;

  update public.matching_settings
  set priority = p_priority,
      updated_at = now(),
      updated_by = v_admin_id
  where id;
end;
$$;
revoke all on function public.admin_set_matching_priority(text[]) from public, anon, authenticated;
grant execute on function public.admin_set_matching_priority(text[]) to authenticated;

-- 8. A saved timetable remembers the order that produced it.
alter table public.session_timetables
  add column matching_priority text[] not null
    default array['committee', 'level', 'friends'];

drop function if exists public.save_session_timetable(uuid, jsonb, uuid);
create or replace function public.save_session_timetable(
  p_session_id uuid,
  p_court_schedule jsonb,
  p_generated_by uuid default null,
  p_matching_priority text[] default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_version integer;
begin
  -- A published timetable may be rewritten, but only through this function.
  perform set_config('badminton.allow_locked_timetable_write', 'on', true);

  insert into public.session_timetables as saved (
    session_id, court_schedule, generated_by, generated_at, version, matching_priority
  )
  values (
    p_session_id, p_court_schedule, p_generated_by, now(), 1,
    coalesce(p_matching_priority, array['committee', 'level', 'friends'])
  )
  on conflict (session_id) do update
    set court_schedule = excluded.court_schedule,
        generated_by = excluded.generated_by,
        generated_at = now(),
        matching_priority = excluded.matching_priority,
        version = saved.version + 1
  returning version into v_version;

  return v_version;
end;
$$;
revoke all on function public.save_session_timetable(uuid, jsonb, uuid, text[]) from public, anon, authenticated;
grant execute on function public.save_session_timetable(uuid, jsonb, uuid, text[]) to service_role;
