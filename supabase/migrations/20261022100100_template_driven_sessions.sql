-- Template-driven session generation.
--
-- Sessions are now materialised from public.session_templates instead of a
-- hardcoded weekday list, and the per-session rules (first-come-first-served
-- or lottery allocation, committee automatic signups) come from the template
-- that created the session.

-- The moment sign-ups open for a template's session on the given date.
create or replace function private.template_signup_opens_at(
  p_template public.session_templates,
  p_event_date date
)
returns timestamptz
language sql
immutable
set search_path = pg_catalog, public
as $$
  select (
    (p_event_date - p_template.signup_opens_lead_days)::timestamp
    + p_template.signup_opens_at
  ) at time zone 'Europe/London';
$$;

revoke all on function private.template_signup_opens_at(public.session_templates, date)
  from public, anon, authenticated;

-- The moment sign-ups close for a template's session on the given date.
create or replace function private.template_confirmation_at(
  p_template public.session_templates,
  p_event_date date
)
returns timestamptz
language sql
immutable
set search_path = pg_catalog, public
as $$
  select (
    (p_event_date - p_template.confirmation_lead_days)::timestamp
    + p_template.confirmation_at
  ) at time zone 'Europe/London';
$$;

revoke all on function private.template_confirmation_at(public.session_templates, date)
  from public, anon, authenticated;

-- Creates the sessions described by the active templates. Sessions that
-- already exist are left untouched, so editing a template never changes a
-- session that has already been published.
create or replace function public.ensure_scheduled_sessions(
  p_weeks_ahead integer default 1
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_template public.session_templates%rowtype;
  v_week_start date := date_trunc('week', now() at time zone 'Europe/London')::date;
  v_event_date date;
  v_signup_opens_at timestamptz;
  v_confirmation_at timestamptz;
  v_created_count integer := 0;
  v_week_offset integer;
begin
  if p_weeks_ahead is null or p_weeks_ahead < 0 or p_weeks_ahead > 8 then
    raise exception using
      errcode = '22023',
      message = 'Prepare between 0 and 8 weeks of sessions.';
  end if;

  for v_template in
    select template.*
    from public.session_templates as template
    where template.is_active
    order by template.weekday, template.name
  loop
    for v_week_offset in 0..p_weeks_ahead loop
      v_event_date := v_week_start + (v_template.weekday - 1) + (v_week_offset * 7);

      if v_template.valid_from is not null and v_event_date < v_template.valid_from then
        continue;
      end if;
      if v_template.valid_until is not null and v_event_date > v_template.valid_until then
        continue;
      end if;

      v_signup_opens_at := private.template_signup_opens_at(v_template, v_event_date);
      v_confirmation_at := private.template_confirmation_at(v_template, v_event_date);

      if v_signup_opens_at >= v_confirmation_at then
        continue;
      end if;

      insert into public.sessions (
        event_date,
        starts_at,
        duration_minutes,
        capacity,
        signup_opens_at,
        confirmation_at,
        template_id,
        allocation_mode,
        fee_cents,
        committee_auto_signup
      )
      values (
        v_event_date,
        v_template.starts_at,
        v_template.duration_minutes,
        v_template.capacity,
        v_signup_opens_at,
        v_confirmation_at,
        v_template.id,
        v_template.allocation_mode,
        v_template.fee_cents,
        v_template.committee_auto_signup
      )
      on conflict (event_date) do nothing;

      if found then
        v_created_count := v_created_count + 1;
      end if;
    end loop;
  end loop;

  perform private.auto_signup_committee_members(null, true);

  return v_created_count;
end;
$$;

revoke all on function public.ensure_scheduled_sessions(integer)
  from public, anon, authenticated;
grant execute on function public.ensure_scheduled_sessions(integer) to service_role;

create or replace function public.ensure_next_week_sessions()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  perform public.ensure_scheduled_sessions(1);
end;
$$;

revoke all on function public.ensure_next_week_sessions() from public, anon, authenticated;
grant execute on function public.ensure_next_week_sessions() to anon, authenticated;

-- The window of sessions shown on the member dashboard. The club week rolls
-- over to the following week when the next week's sign-ups open, which is
-- decided by the templates.
create or replace function public.get_dashboard_window()
returns table (
  from_date date,
  through_date date,
  next_change_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_week_start date := date_trunc('week', (now() at time zone 'Europe/London')::date)::date;
  v_next_cycle_opens_at timestamptz;
  v_display_week_start date;
begin
  select min(private.template_signup_opens_at(template, v_week_start + 7 + (template.weekday - 1)))
  into v_next_cycle_opens_at
  from public.session_templates as template
  where template.is_active;

  v_next_cycle_opens_at := coalesce(v_next_cycle_opens_at, '-infinity'::timestamptz);

  if now() >= v_next_cycle_opens_at then
    v_display_week_start := v_week_start + 7;
  else
    v_display_week_start := v_week_start;
  end if;

  return query
  select
    v_today,
    v_display_week_start + 6,
    (
      select min(private.template_signup_opens_at(template, v_display_week_start + 7 + (template.weekday - 1)))
      from public.session_templates as template
      where template.is_active
    );
end;
$$;

revoke all on function public.get_dashboard_window() from public, anon, authenticated;
grant execute on function public.get_dashboard_window() to anon, authenticated;

drop function public.get_dashboard_sessions(date, date);

create function public.get_dashboard_sessions(
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
  current_user_slot smallint,
  fee_cents integer,
  allocation_mode text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    session.id,
    session.event_date,
    to_char(session.event_date, 'FMDay'),
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
    max(signup.slot_number) filter (where signup.user_id = (select auth.uid())),
    session.fee_cents,
    session.allocation_mode
  from public.sessions as session
  left join public.session_signups as signup on signup.session_id = session.id
  where session.event_date between p_from_date and p_through_date
  group by session.id
  order by session.event_date;
$$;

revoke all on function public.get_dashboard_sessions(date, date) from public, anon, authenticated;
grant execute on function public.get_dashboard_sessions(date, date) to anon, authenticated;

-- Committee members are only signed up automatically for sessions whose
-- template allows it.
create or replace function private.auto_signup_committee_members(
  p_session_id uuid default null,
  p_allow_closed_signup_window boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_session record;
  v_member record;
  v_slot_number smallint;
  v_signup_status text;
begin
  for v_session in
    select session.id, session.capacity
    from public.sessions as session
    where session.status = 'open'
      -- Sessions that do not run committee automatic signups are left alone.
      and session.committee_auto_signup
      and ((session.event_date + session.starts_at) at time zone 'Europe/London') > now()
      and (
        p_allow_closed_signup_window
        or now() >= session.signup_opens_at
      )
      and (p_allow_closed_signup_window or now() < session.confirmation_at)
      and (p_session_id is null or session.id = p_session_id)
    order by session.confirmation_at, session.id
    for update
  loop
    for v_member in
      select profile.id
      from public.profiles as profile
      join auth.users as club_user on club_user.id = profile.id
      where profile.is_committee
        and profile.committee_auto_signup
        and private.is_club_email(club_user.email)
        and (
          not exists (
            select 1
            from public.session_signups as existing_signup
            where existing_signup.session_id = v_session.id
              and existing_signup.user_id = profile.id
          )
          or exists (
            select 1
            from public.session_signups as existing_signup
            join private.committee_auto_signups as automatic_signup
              on automatic_signup.session_id = existing_signup.session_id
             and automatic_signup.user_id = existing_signup.user_id
            where existing_signup.session_id = v_session.id
              and existing_signup.user_id = profile.id
              and existing_signup.status = 'requested'
          )
        )
      order by profile.id
    loop
      select available_slot.slot_number::smallint into v_slot_number
      from generate_series(1, (v_session.capacity + 3) / 4)
        as available_slot(slot_number)
      where (
        select count(*)
        from public.session_signups as signup
        where signup.session_id = v_session.id
          and signup.slot_number = available_slot.slot_number
          and signup.status in ('selected', 'played')
      ) < 4
      order by available_slot.slot_number
      limit 1;

      v_signup_status := case
        when v_slot_number is null then 'waitlisted'
        else 'selected'
      end;

      update public.session_signups as signup
      set status = v_signup_status,
          slot_number = v_slot_number
      where signup.session_id = v_session.id
        and signup.user_id = v_member.id
        and signup.status = 'requested'
        and exists (
          select 1
          from private.committee_auto_signups as automatic_signup
          where automatic_signup.session_id = signup.session_id
            and automatic_signup.user_id = signup.user_id
        );

      if not found then
        insert into public.session_signups (
          session_id,
          user_id,
          status,
          slot_number
        )
        values (
          v_session.id,
          v_member.id,
          v_signup_status,
          v_slot_number
        )
        on conflict (session_id, user_id) do nothing;

        if found then
          insert into private.committee_auto_signups (session_id, user_id)
          values (v_session.id, v_member.id)
          on conflict do nothing;
        end if;
      end if;

      v_slot_number := null;
    end loop;
  end loop;
end;
$$;

revoke all on function private.auto_signup_committee_members(uuid, boolean)
  from public, anon, authenticated;

-- Sign-ups now follow the session's allocation mode: first-come-first-served
-- sessions hand out a place straight away, lottery sessions wait for the
-- fairness draw.
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

revoke all on function public.request_session_signup(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.request_session_signup(uuid, uuid[]) to authenticated;

-- Finalising confirms the session. Lottery sessions allocate their places
-- with the fairness draw, first-come-first-served sessions allocate them in
-- signup order.
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
