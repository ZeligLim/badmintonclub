update public.sessions
set confirmation_at =
  ((event_date - 1)::timestamp at time zone 'Europe/London')
where status = 'open'
  and event_date > (now() at time zone 'Europe/London')::date;

create or replace function public.ensure_next_week_sessions()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_monday date;
  v_signup_opens_at timestamptz;
  v_event_date date;
begin
  v_monday := date_trunc('week', now() at time zone 'Europe/London')::date + 7;
  v_signup_opens_at := (v_monday - 4)::timestamp at time zone 'Europe/London';

  foreach v_event_date in array array[v_monday, v_monday + 2]
  loop
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
      time '18:00',
      120,
      16,
      v_signup_opens_at,
      ((v_event_date - 1)::timestamp at time zone 'Europe/London')
    )
    on conflict (event_date) do nothing;
  end loop;
end;
$$;