update public.profiles as profile
set is_committee_admin = true
from auth.users as club_user
where club_user.id = profile.id
  and lower(club_user.email) = 'g00440616@atu.ie';

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
      and now() >= session.signup_opens_at
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

revoke all on function private.auto_signup_committee_members(uuid, boolean)
  from public, anon, authenticated;

create or replace function public.set_my_committee_auto_signup(p_enabled boolean)
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
    raise exception using errcode = '28000', message = 'Sign in to change your auto-signup setting.';
  end if;

  select email into v_email
  from auth.users
  where id = v_user_id;

  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie committee members can change this setting.';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and is_committee
  ) then
    raise exception using errcode = '42501', message = 'Only committee members can change this setting.';
  end if;
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'Choose whether automatic signup is on or off.';
  end if;

  update public.profiles
  set committee_auto_signup = p_enabled
  where id = v_user_id
    and is_committee;

  if p_enabled then
    perform private.auto_signup_committee_members(null, true);
  end if;
end;
$$;

revoke all on function public.set_my_committee_auto_signup(boolean)
  from public, anon, authenticated;
grant execute on function public.set_my_committee_auto_signup(boolean)
  to authenticated;

create or replace function public.ensure_next_week_sessions()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_monday date;
  v_event_date date;
  v_signup_opens_at timestamptz;
begin
  v_monday := date_trunc('week', now() at time zone 'Europe/London')::date;

  foreach v_event_date in array array[
    v_monday,
    v_monday + 2,
    v_monday + 7,
    v_monday + 9
  ]
  loop
    v_signup_opens_at := (
      (date_trunc('week', v_event_date::timestamp)::date - 4)::timestamp
      at time zone 'Europe/London'
    );

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
      case
        when extract(isodow from v_event_date) = 1 then time '18:00'
        else time '20:00'
      end,
      case
        when extract(isodow from v_event_date) = 1 then 60
        else 120
      end,
      case
        when extract(isodow from v_event_date) = 1 then 16
        else 40
      end,
      v_signup_opens_at,
      ((v_event_date - 1)::timestamp at time zone 'Europe/London')
    )
    on conflict (event_date) do nothing;
  end loop;

  perform private.auto_signup_committee_members(null, true);
end;
$$;