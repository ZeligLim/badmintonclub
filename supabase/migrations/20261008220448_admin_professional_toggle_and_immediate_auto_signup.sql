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
  v_session_id uuid;
begin
  for v_session_id in
    select session.id
    from public.sessions as session
    where session.status = 'open'
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
    with inserted_signups as (
      insert into public.session_signups (session_id, user_id, status)
      select v_session_id, profile.id, 'requested'
      from public.profiles as profile
      join auth.users as club_user on club_user.id = profile.id
      where profile.is_committee
        and profile.committee_auto_signup
        and private.is_club_email(club_user.email)
        and not exists (
          select 1
          from public.session_signups as existing_signup
          where existing_signup.session_id = v_session_id
            and existing_signup.user_id = profile.id
        )
      on conflict (session_id, user_id) do nothing
      returning session_id, user_id
    )
    insert into private.committee_auto_signups (session_id, user_id)
    select session_id, user_id
    from inserted_signups
    on conflict do nothing;
  end loop;
end;
$$;

create function public.admin_set_committee_status(
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

  update public.profiles
  set is_committee = p_is_committee
  where id = p_user_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The selected player profile was not found.';
  end if;
end;
$$;

revoke all on function public.admin_set_committee_status(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_committee_status(uuid, boolean)
  to authenticated;
