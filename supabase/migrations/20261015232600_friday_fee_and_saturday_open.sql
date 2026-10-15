-- Update ensure_next_week_sessions to include Friday sessions for the current and upcoming week.
-- Friday sessions:
--   - Time: 15:00 - 18:00 (180 mins)
--   - Capacity: 16 (2 courts)
--   - First-come-first-served (FCFS)
--   - Fee: €3 per person
--   - Sign-ups open: The preceding Saturday at 00:00 Europe/London (6 days prior)
--   - Sign-ups close / confirm: 30 minutes before start (14:30 Europe/London on Friday)

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
    v_monday + 4,
    v_monday + 7,
    v_monday + 9,
    v_monday + 11
  ]
  loop
    v_signup_opens_at := case
      -- Friday signups open on the preceding Saturday (6 days before) at 00:00 Europe/London
      when extract(isodow from v_event_date) = 5 then
        ((v_event_date - 6)::timestamp at time zone 'Europe/London')
      -- Monday and Wednesday signups open on Thursday (4 days before Monday) at 00:00 Europe/London
      else
        ((date_trunc('week', v_event_date::timestamp)::date - 4)::timestamp at time zone 'Europe/London')
    end;

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
        when extract(isodow from v_event_date) = 5 then time '15:00'
        else time '19:30'
      end,
      case
        when extract(isodow from v_event_date) = 1 then 60
        when extract(isodow from v_event_date) = 5 then 180
        else 120
      end,
      case
        when extract(isodow from v_event_date) = 1 then 16
        when extract(isodow from v_event_date) = 5 then 16
        else 40
      end,
      v_signup_opens_at,
      case
        -- Friday signup closes 30 minutes before 15:00 (14:30 on event date)
        when extract(isodow from v_event_date) = 5 then
          (v_event_date::timestamp + time '14:30') at time zone 'Europe/London'
        else
          ((v_event_date - 1)::timestamp at time zone 'Europe/London')
      end
    )
    on conflict (event_date) do nothing;
  end loop;

  perform private.auto_signup_committee_members(null, true);
end;
$$;

revoke all on function public.ensure_next_week_sessions() from public, anon, authenticated;
grant execute on function public.ensure_next_week_sessions() to anon, authenticated;

-- Run ensure_next_week_sessions to generate next week's Friday session (opens on Saturday).
select public.ensure_next_week_sessions();
