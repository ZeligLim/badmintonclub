-- Configurable recurring session templates.
--
-- The club's recurring weekly sessions are described by rows in
-- public.session_templates. Sessions are materialised from those templates by
-- public.ensure_scheduled_sessions(). Every session keeps a snapshot of the
-- template values it was created from, so editing a template never changes a
-- session that has already been published.

create table public.session_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
    check (char_length(btrim(name)) between 1 and 80),
  -- ISO weekday (1 = Monday ... 7 = Sunday) the session runs on.
  weekday smallint not null
    check (weekday between 1 and 7),
  starts_at time not null,
  duration_minutes smallint not null
    check (duration_minutes between 30 and 360),
  capacity smallint not null
    check (capacity between 4 and 64 and capacity % 4 = 0),
  -- Fee charged per player, in cents.
  fee_cents integer not null default 0
    check (fee_cents between 0 and 10000),
  -- 'lottery' allocates places by the fairness draw, 'fcfs' allocates places
  -- in signup order.
  allocation_mode text not null default 'lottery'
    check (allocation_mode in ('lottery', 'fcfs')),
  committee_auto_signup boolean not null default true,
  -- Days before the session date that sign-ups open, and the time they open.
  signup_opens_lead_days smallint not null default 4
    check (signup_opens_lead_days between 0 and 21),
  signup_opens_at time not null default time '00:00',
  -- Days before the session date that sign-ups close, and the time they close.
  confirmation_lead_days smallint not null default 1
    check (confirmation_lead_days between 0 and 21),
  confirmation_at time not null default time '00:00',
  is_active boolean not null default true,
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_templates_validity_check
    check (
      valid_from is null
      or valid_until is null
      or valid_until >= valid_from
    )
);

create index session_templates_active_idx
  on public.session_templates (weekday, name)
  where is_active;

create or replace function private.touch_session_template_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_session_template_updated_at() from public, anon, authenticated;

create trigger touch_session_template_updated_at
  before update on public.session_templates
  for each row
  execute function private.touch_session_template_updated_at();

alter table public.session_templates enable row level security;

create policy "Session templates are visible to signed-in members"
  on public.session_templates for select to authenticated
  using (true);

revoke all on table public.session_templates from public, anon, authenticated;
grant select on table public.session_templates to authenticated;
grant all on table public.session_templates to service_role;

-- Sessions snapshot the template they came from, so a template change only
-- affects sessions that are created afterwards.
alter table public.sessions
  add column template_id uuid
    references public.session_templates (id) on delete set null,
  add column allocation_mode text not null default 'lottery'
    check (allocation_mode in ('lottery', 'fcfs')),
  add column fee_cents integer not null default 0
    check (fee_cents between 0 and 10000),
  add column committee_auto_signup boolean not null default true;

-- Existing sessions keep the rules they were published with.
update public.sessions
set allocation_mode = case
      when extract(isodow from event_date) = 5 then 'fcfs'
      else 'lottery'
    end,
    fee_cents = case
      when extract(isodow from event_date) = 5 then 300
      else 0
    end,
    committee_auto_signup = case
      when extract(isodow from event_date) = 5 then false
      else true
    end;

-- Weekday, start time, duration and capacity are no longer fixed by weekday.
alter table public.sessions
  drop constraint sessions_weekday_check,
  drop constraint sessions_schedule_check,
  drop constraint sessions_capacity_check;

alter table public.sessions
  add constraint sessions_schedule_check
    check (duration_minutes between 30 and 360),
  add constraint sessions_capacity_check
    check (capacity between 4 and 64 and capacity % 4 = 0);

-- A session can now hold up to 64 players, which is 16 four-player slots.
alter table public.session_signups
  drop constraint session_signups_slot_check;

alter table public.session_signups
  add constraint session_signups_slot_check
  check (
    (
      status in ('selected', 'played')
      and slot_number is not null
      and slot_number between 1 and 16
    )
    or (status not in ('selected', 'played') and slot_number is null)
  );

-- The club's current weekly schedule, expressed as templates.
insert into public.session_templates (
  name,
  weekday,
  starts_at,
  duration_minutes,
  capacity,
  fee_cents,
  allocation_mode,
  committee_auto_signup,
  signup_opens_lead_days,
  signup_opens_at,
  confirmation_lead_days,
  confirmation_at
)
values
  (
    'Monday evening',
    1,
    time '18:00',
    60,
    16,
    0,
    'lottery',
    true,
    4,
    time '00:00',
    1,
    time '00:00'
  ),
  (
    'Wednesday evening',
    3,
    time '19:30',
    120,
    40,
    0,
    'lottery',
    true,
    6,
    time '00:00',
    1,
    time '00:00'
  ),
  (
    'Friday afternoon',
    5,
    time '15:00',
    180,
    16,
    300,
    'fcfs',
    false,
    6,
    time '00:00',
    0,
    time '14:30'
  );

-- The sessions that already exist keep the rules they were published with, but
-- they are linked to the template that describes them so that they keep
-- following it until their sign-ups open.
update public.sessions as session
set template_id = template.id
from public.session_templates as template
where session.template_id is null
  and template.weekday = extract(isodow from session.event_date)
  and template.starts_at = session.starts_at
  and template.duration_minutes = session.duration_minutes
  and template.capacity = session.capacity;
