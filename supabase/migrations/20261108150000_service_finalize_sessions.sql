-- Finalization used to need a signed-in member, so a deadline only passed if
-- somebody had the dashboard open. Give the scheduled job a service-role entry
-- point (BC-07) and let `private.finalize_due_sessions()` run without a user
-- session when the caller is the service role.
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
        case eligible_signups.player_level
          when 'PROFESSIONAL' then 3
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
grant execute on function private.finalize_due_sessions() to service_role;

-- PostgREST only exposes `public`, so give the cron route a callable name.
create or replace function public.finalize_due_sessions_service()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform private.auto_signup_committee_members(null, true);
  return private.finalize_due_sessions();
end;
$$;

revoke all on function public.finalize_due_sessions_service()
  from public, anon, authenticated;
grant execute on function public.finalize_due_sessions_service() to service_role;
