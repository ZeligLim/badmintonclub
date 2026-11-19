alter table public.profiles
  drop constraint if exists profiles_player_level_check,
  add constraint profiles_player_level_check
    check (player_level in ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL'));

create or replace function public.update_my_player_level(p_player_level text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
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
  set player_level = p_player_level
  where id = v_user_id;
end;
$$;

create or replace function public.admin_update_player_access(
  p_user_id uuid,
  p_player_level text,
  p_is_committee boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
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
      is_committee = p_is_committee,
      can_choose_professional = can_choose_professional
        or p_player_level = 'PROFESSIONAL'
  where id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'The selected player profile was not found.';
  end if;
end;
$$;

create or replace function private.assign_court_slots(
  p_session_id uuid,
  p_player_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_remaining_ids uuid[] := coalesce(p_player_ids, '{}'::uuid[]);
  v_slot_number smallint := 1;
  v_court_ids uuid[];
begin
  while cardinality(v_remaining_ids) >= 4 loop
    with players as (
      select
        u.user_id,
        u.ord,
        case p.player_level
          when 'BEGINNER' then 1
          when 'INTERMEDIATE' then 2
          when 'ADVANCED' then 3
          when 'PROFESSIONAL' then 4
          else 2
        end as level_value
      from unnest(v_remaining_ids) with ordinality as u(user_id, ord)
      left join public.profiles as p on p.id = u.user_id
    ),
    friend_pair_counts as (
      select
        least(friend_user.ord, friend_target.ord) as oa,
        greatest(friend_user.ord, friend_target.ord) as ob,
        count(*)::int as edge_count
      from public.session_friend_preferences as preference
      join players as friend_user on friend_user.user_id = preference.user_id
      join players as friend_target on friend_target.user_id = preference.friend_user_id
      where preference.session_id = p_session_id
      group by 1, 2
    ),
    pair_values as (
      select
        f.ord as oa,
        g.ord as ob,
        coalesce(friend_pair_counts.edge_count, 0) as friend_edges,
        case
          when f.level_value is null or g.level_value is null then null
          else abs(f.level_value - g.level_value)
        end as level_diff
      from players as f
      join players as g on g.ord > f.ord
      left join friend_pair_counts
        on friend_pair_counts.oa = f.ord
        and friend_pair_counts.ob = g.ord
    ),
    candidates as (
      select
        f.ord as o1,
        g.ord as o2,
        h.ord as o3,
        i.ord as o4,
        f.ord + g.ord + h.ord + i.ord as rank_sum
      from players as f
      cross join players as g
      cross join players as h
      cross join players as i
      where f.ord < g.ord and g.ord < h.ord and h.ord < i.ord
    ),
    scored_courts as (
      select
        candidates.o1,
        candidates.o2,
        candidates.o3,
        candidates.o4,
        candidates.rank_sum,
        coalesce(v12.friend_edges, 0) + coalesce(v13.friend_edges, 0)
          + coalesce(v14.friend_edges, 0) + coalesce(v23.friend_edges, 0)
          + coalesce(v24.friend_edges, 0) + coalesce(v34.friend_edges, 0) as friend_score,
        coalesce(v12.level_diff, 0) + coalesce(v13.level_diff, 0)
          + coalesce(v14.level_diff, 0) + coalesce(v23.level_diff, 0)
          + coalesce(v24.level_diff, 0) + coalesce(v34.level_diff, 0) as level_gap
      from candidates
      left join pair_values as v12 on v12.oa = candidates.o1 and v12.ob = candidates.o2
      left join pair_values as v13 on v13.oa = candidates.o1 and v13.ob = candidates.o3
      left join pair_values as v14 on v14.oa = candidates.o1 and v14.ob = candidates.o4
      left join pair_values as v23 on v23.oa = candidates.o2 and v23.ob = candidates.o3
      left join pair_values as v24 on v24.oa = candidates.o2 and v24.ob = candidates.o4
      left join pair_values as v34 on v34.oa = candidates.o3 and v34.ob = candidates.o4
    )
    select array[p1.user_id, p2.user_id, p3.user_id, p4.user_id]
    into v_court_ids
    from scored_courts
    join players as p1 on p1.ord = scored_courts.o1
    join players as p2 on p2.ord = scored_courts.o2
    join players as p3 on p3.ord = scored_courts.o3
    join players as p4 on p4.ord = scored_courts.o4
    order by
      scored_courts.friend_score desc,
      scored_courts.level_gap asc,
      scored_courts.rank_sum asc,
      array[p1.user_id, p2.user_id, p3.user_id, p4.user_id] asc
    limit 1;

    update public.session_signups
    set slot_number = v_slot_number
    where session_id = p_session_id
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
    where session_id = p_session_id
      and user_id = any(v_remaining_ids);
  end if;
end;
$$;

revoke all on function private.assign_court_slots(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function private.assign_court_slots(uuid, uuid[])
  to service_role;

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
        case eligible_signups.player_level
          when 'PROFESSIONAL' then 4
          when 'ADVANCED' then 3
          when 'INTERMEDIATE' then 2
          else 1
        end desc,
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
grant execute on function private.finalize_due_sessions() to service_role;
