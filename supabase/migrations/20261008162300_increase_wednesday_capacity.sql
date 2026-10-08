alter table public.sessions
  drop constraint sessions_capacity_check;

update public.sessions
set capacity = 40
where extract(isodow from event_date) = 3
  and event_date >= (now() at time zone 'Europe/London')::date;

alter table public.sessions
  add constraint sessions_capacity_check
  check (
    (extract(isodow from event_date) = 1 and capacity = 16)
    or (extract(isodow from event_date) = 3 and capacity in (32, 40))
  );

alter table public.session_signups
  drop constraint session_signups_slot_check;

alter table public.session_signups
  add constraint session_signups_slot_check
  check (
    (
      status in ('selected', 'played')
      and slot_number is not null
      and slot_number between 1 and 10
    )
    or (status not in ('selected', 'played') and slot_number is null)
  );

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

  perform private.auto_signup_committee_members();
end;
$$;
