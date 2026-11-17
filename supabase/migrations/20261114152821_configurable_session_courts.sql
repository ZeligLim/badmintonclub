alter table public.sessions
  add column court_count smallint;

update public.sessions
set court_count = least(4, greatest(1, ceil(capacity::numeric / 8)::smallint));

alter table public.sessions
  alter column court_count set not null,
  add constraint sessions_court_count_check check (court_count between 1 and 4);

create or replace function private.set_session_court_count_default()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.court_count is null then
    new.court_count := least(4, greatest(1, ceil(new.capacity::numeric / 8)::smallint));
  end if;
  return new;
end;
$$;

create trigger set_session_court_count_default
before insert on public.sessions
for each row execute function private.set_session_court_count_default();

drop function public.get_dashboard_sessions(date, date);
create function public.get_dashboard_sessions(p_from_date date, p_through_date date)
returns table (
  id uuid, event_date date, day_name text, starts_at text,
  duration_minutes smallint, capacity smallint, court_count smallint,
  registered_count bigint, signup_opens_at timestamptz,
  confirmation_at timestamptz, status text, current_user_status text,
  current_user_slot smallint, fee_cents integer, allocation_mode text
)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select session.id, session.event_date, to_char(session.event_date, 'FMDay'),
    to_char(session.starts_at, 'HH24:MI'), session.duration_minutes,
    session.capacity, session.court_count,
    count(signup.user_id) filter (where signup.status in ('requested', 'selected', 'played')),
    session.signup_opens_at, session.confirmation_at,
    case when session.event_date < (now() at time zone 'Europe/London')::date then 'closed' else session.status end,
    max(signup.status) filter (where signup.user_id = (select auth.uid())),
    max(signup.slot_number) filter (where signup.user_id = (select auth.uid())),
    session.fee_cents, session.allocation_mode
  from public.sessions as session
  left join public.session_signups as signup on signup.session_id = session.id
  where session.event_date between p_from_date and p_through_date
  group by session.id order by session.event_date;
$$;
revoke all on function public.get_dashboard_sessions(date, date) from public, anon, authenticated;
grant execute on function public.get_dashboard_sessions(date, date) to anon, authenticated;
