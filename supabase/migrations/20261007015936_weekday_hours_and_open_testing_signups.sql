alter table public.sessions
  drop constraint sessions_schedule_check;

update public.sessions
set
  starts_at = case
    when extract(isodow from event_date) = 1 then time '18:00'
    else time '20:00'
  end,
  duration_minutes = case
    when extract(isodow from event_date) = 1 then 60
    else 120
  end;

alter table public.sessions
  add constraint sessions_schedule_check
  check (
    (
      extract(isodow from event_date) = 1
      and starts_at = time '18:00'
      and duration_minutes = 60
    )
    or (
      extract(isodow from event_date) = 3
      and starts_at = time '20:00'
      and duration_minutes = 120
    )
  );

create or replace function public.ensure_next_week_sessions()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
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
      16,
      v_signup_opens_at,
      ((v_event_date - 1)::timestamp at time zone 'Europe/London')
    )
    on conflict (event_date) do nothing;
  end loop;
end;
$$;

create or replace function public.request_session_signup(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
  v_existing_status text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to join a session.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'This session is no longer open.';
  end if;

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
end;
$$;

create or replace function public.cancel_session_signup(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
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

  if not found or v_session.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'This session can no longer be changed.';
  end if;

  update public.session_signups
  set status = 'cancelled', slot_number = null
  where session_id = p_session_id
    and user_id = v_user_id
    and status = 'requested';

  if not found then
    raise exception using errcode = 'P0001', message = 'No open signup request was found to cancel.';
  end if;
end;
$$;