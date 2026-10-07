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