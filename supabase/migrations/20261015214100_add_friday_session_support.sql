-- Allow Friday (isodow=5) sessions in addition to Monday (1) and Wednesday (3).
-- Also inserts the specific one-off Friday 2026-10-16 15:00–18:00 session.

-- 1. Relax the weekday check.
alter table public.sessions
  drop constraint sessions_weekday_check;

alter table public.sessions
  add constraint sessions_weekday_check
  check (extract(isodow from event_date) in (1, 3, 5));

-- 2. Relax the schedule check to permit Friday 15:00 / 180 min.
alter table public.sessions
  drop constraint sessions_schedule_check;

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
      and starts_at in (time '19:30', time '20:00')
      and duration_minutes = 120
    )
    or (
      extract(isodow from event_date) = 5
      and starts_at = time '15:00'
      and duration_minutes = 180
    )
  );

-- 3. Relax the capacity check.
--    Monday = 16, Wednesday = 32 or 40, Friday = 16 (2 courts × 8).
alter table public.sessions
  drop constraint sessions_capacity_check;

alter table public.sessions
  add constraint sessions_capacity_check
  check (
    (extract(isodow from event_date) = 1 and capacity = 16)
    or (extract(isodow from event_date) = 3 and capacity in (32, 40))
    or (extract(isodow from event_date) = 5 and capacity = 16)
  );

-- 4. Update get_dashboard_sessions to also return 'Friday' as day_name.
create or replace function public.get_dashboard_sessions(
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
  current_user_slot smallint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    session.id,
    session.event_date,
    case extract(isodow from session.event_date)
      when 1 then 'Monday'
      when 3 then 'Wednesday'
      when 5 then 'Friday'
      else 'Other'
    end,
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
    max(signup.slot_number) filter (where signup.user_id = (select auth.uid()))
  from public.sessions as session
  left join public.session_signups as signup on signup.session_id = session.id
  where session.event_date between p_from_date and p_through_date
  group by session.id
  order by session.event_date;
$$;

revoke all on function public.get_dashboard_sessions(date, date) from public, anon, authenticated;
grant execute on function public.get_dashboard_sessions(date, date) to anon, authenticated;

-- 5. Insert the one-off Friday session.
--    Sign-ups open immediately; close (confirmation_at) 30 minutes before 15:00 = 14:30 London.
--    finalize_due_sessions will run at 14:30 and assign players to courts.
insert into public.sessions (
  event_date,
  starts_at,
  duration_minutes,
  capacity,
  signup_opens_at,
  confirmation_at
)
values (
  '2026-10-16',
  time '15:00',
  180,
  16,
  '2026-10-15 00:00:00 Europe/London',
  '2026-10-16 14:30:00 Europe/London'
)
on conflict (event_date) do update set
  starts_at = excluded.starts_at,
  duration_minutes = excluded.duration_minutes,
  capacity = excluded.capacity,
  signup_opens_at = excluded.signup_opens_at,
  confirmation_at = excluded.confirmation_at;

select private.auto_signup_committee_members(null, true);
