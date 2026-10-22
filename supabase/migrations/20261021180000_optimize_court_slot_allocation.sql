-- Fix statement timeouts (Postgres 57014) when saving friend choices or finalizing sessions.
--
-- Problem
-- -------
-- private.rematch_session_slots() and private.finalize_due_sessions() both allocated
-- courts with a 4-way self-join over the remaining players and then, for every
-- candidate court, ran two correlated subqueries:
--
--   * a friend_score subquery scanning session_friend_preferences for the 4 candidate ids
--   * a level_gap subquery joining public.profiles to itself across the 4 candidate ids
--
-- Both subqueries re-executed the same work for every one of the C(n,4) candidate
-- courts, and the profiles self-join was not restricted to the candidate ids in a way
-- Postgres could index. On a 40-player Wednesday session this produced ~870K shared
-- buffer hits and 1.6-9.7 seconds of work (highly variable, depending on the plan
-- and cache state Postgres picks), which exceeds the PostgREST statement timeout.
-- The user-visible symptom was "Could not save your friend choices. Please try again."
-- with the underlying error `Could not save session friend preferences. { code: '57014' }`.
--
-- Fix
-- ---
-- Extract the court allocation into private.assign_court_slots(), which:
--   * computes each unordered player pair's friend-edge count and level difference once
--     (a single join over session_friend_preferences, plus a single profiles join)
--   * scores each candidate court from those precomputed pair values
--
-- The selection rule is unchanged: order by friend_score desc, level_gap asc,
-- rank_sum asc, then the court id array ascending, taking the first court. Court
-- composition and slot_number assignments are identical to the previous
-- implementation (verified by A/B comparison against the original functions,
-- comparing the exact (user_id -> slot_number) maps):
--
--   rematch_session_slots     21 edge-case groups + 60 randomised friend graphs
--   assign_court_slots        4 edge-case groups + 40 randomised finalize-shaped
--                             inputs (existing selected/played players first,
--                             then newly ranked requested signups)
--   finalize_due_sessions     4 edge-case groups + 25 randomised cases, comparing
--                             signups, profiles.last_played_at, sessions.status
--                             and the return value of the whole function
--
-- The same helper is reused by private.finalize_due_sessions() so session
-- finalization no longer carries a duplicate copy of the slow query.
--
-- Measured on the 2026-10-21 production shape (38 signed up, 74 profiles):
--   buffer hits   872,013 -> 1,546   (564x fewer)
--   execution     1,626-4,966 ms -> 315-320 ms
-- At 40 players (the Wednesday capacity cap): 6,080-9,680 ms -> 408-437 ms.
--
-- The original implementation exceeds a 1 s statement_timeout at production
-- shape; the new one completes in ~0.32 s.

-- 1. Shared, set-based court assignment helper.
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
      -- player_level is NOT NULL with a CHECK constraint and session_signups.user_id
      -- has a foreign key to profiles, so the 'else 3' branch reproduces the previous
      -- `case ... when 'BEGINNER' then 1 when 'INTERMEDIATE' then 2 else 3` exactly.
      select
        u.user_id,
        u.ord,
        case p.player_level
          when 'BEGINNER' then 1
          when 'INTERMEDIATE' then 2
          else 3
        end as level_value
      from unnest(v_remaining_ids) with ordinality as u(user_id, ord)
      left join public.profiles as p on p.id = u.user_id
    ),
    friend_pair_counts as (
      -- One pass over the session's friend preferences instead of one per candidate
      -- court. Both directions of a preference are counted, matching the previous
      -- `user_id = any(...) and friend_user_id = any(...)` behaviour.
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

-- 2. private.rematch_session_slots now delegates to the shared helper.
create or replace function private.rematch_session_slots(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_remaining_ids uuid[];
begin
  select array_agg(signup.user_id order by signup.slot_number nulls last, signup.signed_up_at, signup.user_id)
  into v_remaining_ids
  from public.session_signups as signup
  where signup.session_id = p_session_id
    and signup.status = 'selected';

  perform private.assign_court_slots(
    p_session_id,
    coalesce(v_remaining_ids, '{}'::uuid[])
  );
end;
$$;

revoke all on function private.rematch_session_slots(uuid)
  from public, anon, authenticated;
grant execute on function private.rematch_session_slots(uuid)
  to service_role;

-- 3. private.finalize_due_sessions no longer carries a duplicate copy of the
--    slow court-allocation loop; it delegates to the shared helper.
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

    -- Court allocation is delegated to the shared set-based helper. The previous
    -- inline implementation is preserved verbatim in
    -- 20261009014952_committee_immediate_confirmation.sql for reference.
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

revoke all on function private.finalize_due_sessions()
  from public, anon, authenticated;
