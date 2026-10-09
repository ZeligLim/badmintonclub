create or replace function public.admin_set_committee_status(
  p_user_id uuid,
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
  v_member_email text;
  v_signup record;
  v_slot_number smallint;
begin
  select email into v_admin_email
  from auth.users
  where id = v_admin_id;

  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1
      from public.profiles
      where id = v_admin_id
        and is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can change committee status.';
  end if;

  if p_user_id is null or p_is_committee is null then
    raise exception using
      errcode = '22023',
      message = 'Select a member and committee status.';
  end if;

  select email into v_member_email
  from auth.users
  where id = p_user_id;

  if not private.is_club_email(v_member_email) then
    raise exception using
      errcode = '22023',
      message = 'The selected player is not an eligible club member.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'The selected player profile was not found.';
  end if;

  if p_is_committee then
    perform session.id
    from public.sessions as session
    join public.session_signups as signup
      on signup.session_id = session.id
    where signup.user_id = p_user_id
      and signup.status = 'requested'
      and session.status = 'open'
      and session.event_date >= (now() at time zone 'Europe/London')::date
      and now() >= session.signup_opens_at
      and now() < session.confirmation_at
      and not exists (
        select 1
        from private.committee_auto_signups as automatic_signup
        where automatic_signup.session_id = signup.session_id
          and automatic_signup.user_id = signup.user_id
      )
    order by session.id
    for update of session;
  end if;

  update public.profiles
  set is_committee = p_is_committee
  where id = p_user_id;

  if p_is_committee then
    for v_signup in
      select session.id as session_id, session.capacity
      from public.sessions as session
      join public.session_signups as signup
        on signup.session_id = session.id
      where signup.user_id = p_user_id
        and signup.status = 'requested'
        and session.status = 'open'
        and session.event_date >= (now() at time zone 'Europe/London')::date
        and now() >= session.signup_opens_at
        and now() < session.confirmation_at
        and not exists (
          select 1
          from private.committee_auto_signups as automatic_signup
          where automatic_signup.session_id = signup.session_id
            and automatic_signup.user_id = signup.user_id
        )
      order by session.id
    loop
      select available_slot.slot_number::smallint into v_slot_number
      from generate_series(1, (v_signup.capacity + 3) / 4)
        as available_slot(slot_number)
      where (
        select count(*)
        from public.session_signups as existing_signup
        where existing_signup.session_id = v_signup.session_id
          and existing_signup.slot_number = available_slot.slot_number
          and existing_signup.status in ('selected', 'played')
      ) < 4
      order by available_slot.slot_number
      limit 1;

      update public.session_signups
      set status = case
            when v_slot_number is null then 'waitlisted'
            else 'selected'
          end,
          slot_number = v_slot_number
      where session_id = v_signup.session_id
        and user_id = p_user_id
        and status = 'requested';

      v_slot_number := null;
    end loop;
  end if;
end;
$$;

create or replace function public.cancel_session_signup(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
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
    and status in ('requested', 'selected', 'waitlisted');

  if not found then
    raise exception using errcode = 'P0001', message = 'No open signup request was found to cancel.';
  end if;
end;
$$;