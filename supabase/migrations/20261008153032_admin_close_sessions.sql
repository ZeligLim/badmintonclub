alter table public.sessions
  drop constraint sessions_status_check,
  add constraint sessions_status_check
    check (status in ('open', 'confirmed', 'closed', 'cancelled'));

create table private.session_cancellation_state (
  session_id uuid primary key
    references public.sessions (id) on delete cascade,
  previous_status text not null
    check (previous_status in ('open', 'confirmed')),
  changed_at timestamptz not null default now()
);

revoke all on table private.session_cancellation_state
  from public, anon, authenticated;

create function public.admin_set_session_happening(
  p_session_id uuid,
  p_happening boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_session_status text;
  v_previous_status text;
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
      where id = v_admin_id and is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can change session availability.';
  end if;

  if p_session_id is null or p_happening is null then
    raise exception using
      errcode = '22023',
      message = 'Select a session and availability state.';
  end if;

  select status into v_session_status
  from public.sessions
  where id = p_session_id
    and ((event_date + starts_at) at time zone 'Europe/London') > now()
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The upcoming session was not found.';
  end if;

  if not p_happening then
    if v_session_status = 'cancelled' then
      return;
    end if;
    if v_session_status not in ('open', 'confirmed') then
      raise exception using
        errcode = 'P0001',
        message = 'This session cannot be marked as not happening.';
    end if;

    insert into private.session_cancellation_state (session_id, previous_status)
    values (p_session_id, v_session_status)
    on conflict (session_id) do update
      set previous_status = excluded.previous_status,
          changed_at = now();

    update public.sessions
    set status = 'cancelled'
    where id = p_session_id;
    return;
  end if;

  if v_session_status <> 'cancelled' then
    return;
  end if;

  select previous_status into v_previous_status
  from private.session_cancellation_state
  where session_id = p_session_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'The previous session state could not be restored.';
  end if;

  update public.sessions
  set status = v_previous_status
  where id = p_session_id;

  delete from private.session_cancellation_state
  where session_id = p_session_id;
end;
$$;

revoke all on function public.admin_set_session_happening(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_session_happening(uuid, boolean)
  to authenticated;