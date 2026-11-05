-- A timetable is public from 30 minutes before the session starts. From that
-- moment the saved row is the single source of truth for the admin view, every
-- member's dashboard and booking emails. Keep it immutable even if a committee
-- administrator calls the table directly.
--
-- The backend uses the service role for two trusted operations:
--   * creating the first saved timetable after the release time, if it is
--     missing (INSERT is always allowed);
--   * development tooling that resets the local database.
-- Updates and deletes from authenticated clients are rejected once published.
create or replace function private.prevent_published_timetable_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_session_id uuid;
  v_event_date date;
  v_starts_at time;
  v_role text := coalesce((select auth.role()), '');
begin
  if v_role = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;

  select session.event_date, session.starts_at
  into v_event_date, v_starts_at
  from public.sessions as session
  where session.id = v_session_id;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if now() >= (v_event_date + v_starts_at) at time zone 'Europe/London'
    - interval '30 minutes' then
    raise exception using
      errcode = 'P0001',
      message = 'The timetable has already been released to players and can no longer be changed.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_published_timetable_changes()
  from public, anon, authenticated;

drop trigger if exists prevent_published_timetable_changes
  on public.session_timetables;

create trigger prevent_published_timetable_changes
  before update or delete on public.session_timetables
  for each row execute function private.prevent_published_timetable_changes();

-- Confirmation changes the roster (requested players become selected). Any
-- timetable an administrator previewed while the session was open is stale.
-- Remove it at the moment the session becomes confirmed, while the session is
-- still unlocked, so the first confirmed read rebuilds it from the final
-- roster. If confirmation happens after the release time the timetable is
-- already public and is deliberately left untouched.
create or replace function private.invalidate_timetable_on_confirmation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if new.status = 'confirmed'
    and old.status is distinct from 'confirmed'
    and now() < (new.event_date + new.starts_at) at time zone 'Europe/London'
      - interval '30 minutes' then
    delete from public.session_timetables
    where session_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.invalidate_timetable_on_confirmation()
  from public, anon, authenticated;

drop trigger if exists invalidate_timetable_on_confirmation
  on public.sessions;

create trigger invalidate_timetable_on_confirmation
  after update of status on public.sessions
  for each row execute function private.invalidate_timetable_on_confirmation();

-- Backfill for timetables saved before this migration: a confirmed session
-- whose saved timetable predates its confirmation deadline was built from an
-- open-session preview and can be missing newly selected players. Remove those
-- stale previews while they are still private; the next read rebuilds them.
delete from public.session_timetables as timetable
using public.sessions as session
where timetable.session_id = session.id
  and session.status = 'confirmed'
  and timetable.generated_at < session.confirmation_at
  and now() < (session.event_date + session.starts_at) at time zone 'Europe/London'
    - interval '30 minutes';
