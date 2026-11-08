begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  ('e6000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'repair-' || n || '@atu.ie',
  crypt('password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
from generate_series(1, 5) as n;

update public.profiles
set is_committee = true, is_committee_admin = true
where id = 'e6000000-0000-4000-8000-000000000001';

update public.profiles
set display_name = 'Repair ' || right(id::text, 1)
where id::text like 'e6000000-0000-4000-8000-%';

-- A released Monday session: two hours, one court, everybody has played.
insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity,
  signup_opens_at, confirmation_at, status, allocation_mode, fee_cents, committee_auto_signup
)
values (
  'e7000000-0000-4000-8000-000000000001',
  (date_trunc('week', now() at time zone 'Europe/London')::date),
  time '00:01', 120, 8,
  now() - interval '4 days', now() - interval '3 days',
  'confirmed', 'lottery', 0, false
);

insert into public.session_signups (session_id, user_id, status, slot_number, signed_up_at)
select
  'e7000000-0000-4000-8000-000000000001',
  profile.id,
  case when profile.id = 'e6000000-0000-4000-8000-000000000005' then 'waitlisted' else 'selected' end,
  case when profile.id = 'e6000000-0000-4000-8000-000000000005' then null else 1 end,
  now() - interval '30 minutes'
from public.profiles as profile
where profile.id::text like 'e6000000-0000-4000-8000-%';

insert into public.session_timetables (session_id, court_schedule, generated_by, generated_at)
values (
  'e7000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'courtNumber', 1,
      'startAt', '00:01',
      'endAt', '00:31',
      'players', jsonb_build_array(
        'e6000000-0000-4000-8000-000000000001',
        'e6000000-0000-4000-8000-000000000002',
        'e6000000-0000-4000-8000-000000000003',
        'e6000000-0000-4000-8000-000000000004'
      )
    )
  ),
  null,
  now()
);

select ok(
  now() >= (
    select (session.event_date + session.starts_at) at time zone 'Europe/London'
    from public.sessions as session
    where session.id = 'e7000000-0000-4000-8000-000000000001'
  ) - interval '30 minutes',
  'the session is past its release time'
);

-- Ordinary members cannot repair anything.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.admin_swap_session_player(
       'e7000000-0000-4000-8000-000000000001',
       'e6000000-0000-4000-8000-000000000004',
       'e6000000-0000-4000-8000-000000000005',
       'member attempt'
     ) $$,
  '42501',
  'Only a club administrator can repair a timetable.',
  'a plain member cannot repair the timetable'
);
reset role;

-- Even after release, the administrator can swap a player, and the change is
-- audited.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.admin_swap_session_player(
       'e7000000-0000-4000-8000-000000000001',
       'e6000000-0000-4000-8000-000000000004',
       'e6000000-0000-4000-8000-000000000005',
       'four could not make it'
     ) $$,
  'an administrator can repair a released timetable'
);
reset role;

select ok(
  not exists (
    select 1
    from public.session_timetables as timetable
    cross join lateral jsonb_array_elements(timetable.court_schedule) as game
    cross join lateral jsonb_array_elements_text(game -> 'players') as player
    where timetable.session_id = 'e7000000-0000-4000-8000-000000000001'
      and player = 'e6000000-0000-4000-8000-000000000004'
  ),
  'the replaced player is gone from every game'
);

select ok(
  exists (
    select 1
    from public.session_timetables as timetable
    cross join lateral jsonb_array_elements(timetable.court_schedule) as game
    cross join lateral jsonb_array_elements_text(game -> 'players') as player
    where timetable.session_id = 'e7000000-0000-4000-8000-000000000001'
      and player = 'e6000000-0000-4000-8000-000000000005'
  ),
  'the promoted member appears in the timetable'
);

select is(
  (
    select status from public.session_signups
    where session_id = 'e7000000-0000-4000-8000-000000000001'
      and user_id = 'e6000000-0000-4000-8000-000000000004'
  ),
  'waitlisted',
  'the replaced player moves to the waitlist'
);

select is(
  (
    select status from public.session_signups
    where session_id = 'e7000000-0000-4000-8000-000000000001'
      and user_id = 'e6000000-0000-4000-8000-000000000005'
  ),
  'selected',
  'the promoted member becomes selected'
);

select is(
  (
    select details ->> 'reason' from public.admin_audit_log
    where action = 'swap-player'
  ),
  'four could not make it',
  'the reason is recorded with the change'
);

select is(
  (
    select count(*) from public.admin_audit_log where action = 'swap-player'
  ),
  1::bigint,
  'one audit entry per repair'
);

select * from finish();
rollback;
