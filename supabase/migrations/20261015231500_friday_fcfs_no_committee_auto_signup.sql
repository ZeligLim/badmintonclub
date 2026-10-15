-- 1. Exclude Friday sessions from committee auto-signup.
-- Friday sessions operate on a strict first-come-first-serve basis for all players.
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
      -- Never auto-sign up committee members for Friday sessions (FCFS basis).
      and extract(isodow from session.event_date) <> 5
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

-- 2. Update request_session_signup so Friday is first-come-first-serve for all members.
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
  v_is_friday boolean := false;
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

  v_is_friday := extract(isodow from v_session.event_date) = 5;

  -- Friday is first-come-first-serve for all members (committee members do not get priority).
  -- Monday and Wednesday retain lottery signups with committee immediate confirmation.
  if v_is_friday or v_is_committee then
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

-- 3. Clean up the committee auto-signups that were erroneously added to Friday sessions.
delete from private.committee_auto_signups as automatic_signup
using public.sessions as session
where automatic_signup.session_id = session.id
  and extract(isodow from session.event_date) = 5;

delete from public.session_signups as signup
using public.sessions as session
where signup.session_id = session.id
  and extract(isodow from session.event_date) = 5
  and signup.user_id in (
    '3630b414-c43d-4119-86e4-84930f304965',
    '767504c5-4a5c-4a20-a732-a1a735b674a9',
    'b23a3848-31fd-4a06-9a14-10d7fc38a7e6',
    'f84dd0db-08bb-4253-a2b8-7dee8db48024'
  );

-- 4. Confirm any existing player who signed up manually for Friday FCFS (e.g. Zelig Lim).
update public.session_signups as signup
set status = 'selected',
    slot_number = 1
from public.sessions as session
where signup.session_id = session.id
  and extract(isodow from session.event_date) = 5
  and signup.status = 'requested';
