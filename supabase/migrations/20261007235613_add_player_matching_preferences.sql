alter table public.profiles
  add column player_level text not null default 'INTERMEDIATE'
    check (player_level in ('BEGINNER', 'INTERMEDIATE', 'PROFESSIONAL')),
  add column is_committee boolean not null default false,
  add column is_committee_admin boolean not null default false;

create table public.session_friend_preferences (
  session_id uuid not null,
  user_id uuid not null,
  friend_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id, friend_user_id),
  foreign key (session_id, user_id)
    references public.session_signups (session_id, user_id) on delete cascade,
  constraint session_friend_preferences_not_self
    check (user_id <> friend_user_id)
);

create index session_friend_preferences_friend_idx
  on public.session_friend_preferences (session_id, friend_user_id, user_id);

alter table public.session_friend_preferences enable row level security;
revoke all on table public.session_friend_preferences from public, anon, authenticated;
grant all on table public.session_friend_preferences to service_role;

drop function public.request_session_signup(uuid);

create function public.request_session_signup(
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
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to join a session.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie email addresses can sign up for sessions.';
  end if;
  if cardinality(v_friend_ids) > 3 then
    raise exception using errcode = '22023', message = 'Select no more than three friends.';
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

  v_display_name := left(
    nullif(btrim(split_part(coalesce((select auth.jwt()) ->> 'email', ''), '@', 1)), ''),
    80
  );
  insert into public.profiles (id, display_name)
  values (v_user_id, coalesce(v_display_name, 'Player'))
  on conflict (id) do nothing;

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

  delete from public.session_friend_preferences
  where session_id = p_session_id and user_id = v_user_id;

  insert into public.session_friend_preferences (session_id, user_id, friend_user_id)
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

revoke all on function public.request_session_signup(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.request_session_signup(uuid, uuid[])
  to authenticated;

create or replace function public.update_my_player_level(p_player_level text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to update your player level.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can update their level.';
  end if;
  if p_player_level is null
    or p_player_level not in ('BEGINNER', 'INTERMEDIATE') then
    raise exception using errcode = '22023', message = 'Professional level is assigned by a club administrator.';
  end if;

  update public.profiles
  set player_level = p_player_level
  where id = v_user_id;
end;
$$;

revoke all on function public.update_my_player_level(text)
  from public, anon, authenticated;
grant execute on function public.update_my_player_level(text)
  to authenticated;

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
    or p_player_level not in ('BEGINNER', 'INTERMEDIATE', 'PROFESSIONAL')
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

revoke all on function public.admin_update_player_access(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_update_player_access(uuid, text, boolean)
  to authenticated;

create or replace function public.admin_list_club_players()
returns table (
  user_id uuid,
  display_name text,
  player_level text,
  is_committee boolean
)
language plpgsql
stable
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
    raise exception using errcode = '42501', message = 'Only a club administrator can list club players.';
  end if;

  return query
  select profile.id, profile.display_name, profile.player_level, profile.is_committee
  from public.profiles as profile
  join auth.users as club_user on club_user.id = profile.id
  where private.is_club_email(club_user.email)
  order by profile.display_name, profile.id;
end;
$$;

revoke all on function public.admin_list_club_players()
  from public, anon, authenticated;
grant execute on function public.admin_list_club_players()
  to authenticated;

create or replace function public.get_friend_candidates(p_session_id uuid)
returns table (
  user_id uuid,
  display_name text,
  player_level text,
  is_selected boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to view club members.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can view friend choices.';
  end if;
  if not exists (
    select 1 from public.sessions
    where id = p_session_id and status = 'open'
  ) then
    raise exception using errcode = 'P0001', message = 'Friend choices are only available before session confirmation.';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    profile.player_level,
    preference.friend_user_id is not null
  from public.profiles as profile
  join auth.users as club_user on club_user.id = profile.id
  left join public.session_friend_preferences as preference
    on preference.session_id = p_session_id
    and preference.user_id = v_user_id
    and preference.friend_user_id = profile.id
  where profile.id <> v_user_id
    and private.is_club_email(club_user.email)
  order by profile.display_name, profile.id;
end;
$$;

revoke all on function public.get_friend_candidates(uuid)
  from public, anon, authenticated;
grant execute on function public.get_friend_candidates(uuid)
  to authenticated;

create or replace function public.finalize_due_sessions()
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
  v_remaining_ids uuid[];
  v_court_ids uuid[];
  v_selected_count integer;
  v_slot_number smallint;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or split_part(v_claim_email, '@', 2) <> 'atu.ie' then
    raise exception using
      errcode = '28000',
      message = 'Only @atu.ie email addresses can finalize sessions.';
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
    with recursive eligible_signups as (
      select
        signup.user_id,
        signup.signed_up_at,
        profile.last_played_at,
        profile.is_committee
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
      eligible_signups.signed_up_at asc,
      eligible_signups.user_id asc
    )
    into v_ranked_ids
    from eligible_signups
    join component_map using (user_id)
    join group_freshness using (group_id);

    v_ranked_ids := coalesce(v_ranked_ids, '{}'::uuid[]);
    v_selected_count := least(cardinality(v_ranked_ids), v_session.capacity);
    v_selected_ids := v_ranked_ids[1:v_selected_count];

    update public.session_signups as signup
    set
      status = case
        when signup.user_id = any(v_selected_ids) then 'selected'
        else 'waitlisted'
      end,
      slot_number = case
        when signup.user_id = any(v_selected_ids)
          then ((array_position(v_ranked_ids, signup.user_id) - 1) / 4 + 1)::smallint
        else null
      end
    where signup.session_id = v_session.id
      and signup.status = 'requested'
      and signup.user_id = any(v_ranked_ids);

    v_remaining_ids := v_selected_ids;
    v_slot_number := 1;
    while cardinality(v_remaining_ids) >= 4 loop
      with candidate_courts as (
        select
          array[first_player.user_id, second_player.user_id, third_player.user_id, fourth_player.user_id] as user_ids,
          first_player.ordinality + second_player.ordinality
            + third_player.ordinality + fourth_player.ordinality as rank_sum
        from unnest(v_remaining_ids) with ordinality as first_player(user_id, ordinality)
        cross join unnest(v_remaining_ids) with ordinality as second_player(user_id, ordinality)
        cross join unnest(v_remaining_ids) with ordinality as third_player(user_id, ordinality)
        cross join unnest(v_remaining_ids) with ordinality as fourth_player(user_id, ordinality)
        where first_player.ordinality < second_player.ordinality
          and second_player.ordinality < third_player.ordinality
          and third_player.ordinality < fourth_player.ordinality
      ),
      scored_courts as (
        select
          candidate_courts.user_ids,
          candidate_courts.rank_sum,
          (
            select count(*)
            from public.session_friend_preferences as preference
            where preference.session_id = v_session.id
              and preference.user_id = any(candidate_courts.user_ids)
              and preference.friend_user_id = any(candidate_courts.user_ids)
          ) as friend_score,
          (
            select coalesce(sum(abs(
              case first_profile.player_level
                when 'BEGINNER' then 1
                when 'INTERMEDIATE' then 2
                else 3
              end
              -
              case second_profile.player_level
                when 'BEGINNER' then 1
                when 'INTERMEDIATE' then 2
                else 3
              end
            )), 0)
            from public.profiles as first_profile
            join public.profiles as second_profile
              on first_profile.id < second_profile.id
            where first_profile.id = any(candidate_courts.user_ids)
              and second_profile.id = any(candidate_courts.user_ids)
          ) as level_gap
        from candidate_courts
      )
      select user_ids
      into v_court_ids
      from scored_courts
      order by friend_score desc, level_gap asc, rank_sum asc, user_ids asc
      limit 1;

      update public.session_signups
      set slot_number = v_slot_number
      where session_id = v_session.id
        and user_id = any(v_court_ids);

      select array_agg(remaining.user_id order by remaining.ordinality)
      into v_remaining_ids
      from unnest(v_remaining_ids) with ordinality as remaining(user_id, ordinality)
      where remaining.user_id <> all(v_court_ids);

      v_slot_number := v_slot_number + 1;
    end loop;

    if cardinality(v_remaining_ids) > 0 then
      update public.session_signups
      set slot_number = v_slot_number
      where session_id = v_session.id
        and user_id = any(v_remaining_ids);
    end if;

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