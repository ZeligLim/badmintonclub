begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  ('f6000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'edit-' || n || '@atu.ie',
  crypt('password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
from generate_series(1, 10) as n;

update public.profiles
set is_committee = true, is_committee_admin = true
where id = 'f6000000-0000-4000-8000-000000000001';

update public.profiles
set display_name = 'Editor ' || right(id::text, 1)
where id::text like 'f6000000-0000-4000-8000-%';

-- A released session whose timetable has two courts and two rounds, so a swap
-- has to follow a player across more than one game.
insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity,
  signup_opens_at, confirmation_at, status, allocation_mode, fee_cents, committee_auto_signup
)
values (
  'f7000000-0000-4000-8000-000000000001',
  (date_trunc('week', now() at time zone 'Europe/London')::date),
  time '00:01', 120, 8,
  now() - interval '4 days', now() - interval '3 days',
  'confirmed', 'lottery', 0, false
);

insert into public.session_signups (session_id, user_id, status, slot_number, signed_up_at)
select
  'f7000000-0000-4000-8000-000000000001',
  profile.id,
  case when profile.id in ('f6000000-0000-4000-8000-000000000009', 'f6000000-0000-4000-8000-000000000010') then 'waitlisted' else 'selected' end,
  case when profile.id in ('f6000000-0000-4000-8000-000000000009', 'f6000000-0000-4000-8000-000000000010') then null else 1 end,
  now() - interval '30 minutes'
from public.profiles as profile
where profile.id::text like 'f6000000-0000-4000-8000-%';

insert into public.session_timetables (session_id, court_schedule, generated_by, generated_at)
values (
  'f7000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'courtNumber', 1, 'startAt', '00:01', 'endAt', '00:31',
      'teamA', jsonb_build_array(), 'teamB', jsonb_build_array(),
      'players', jsonb_build_array(
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000001', 'displayName', 'Editor 1', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', true),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000002', 'displayName', 'Editor 2', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000003', 'displayName', 'Editor 3', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000004', 'displayName', 'Editor 4', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false)
      )
    ),
    jsonb_build_object(
      'courtNumber', 2, 'startAt', '00:01', 'endAt', '00:31',
      'teamA', jsonb_build_array(), 'teamB', jsonb_build_array(),
      'players', jsonb_build_array(
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000005', 'displayName', 'Editor 5', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000006', 'displayName', 'Editor 6', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000007', 'displayName', 'Editor 7', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000008', 'displayName', 'Editor 8', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false)
      )
    ),
    jsonb_build_object(
      'courtNumber', 1, 'startAt', '00:31', 'endAt', '01:01',
      'teamA', jsonb_build_array(), 'teamB', jsonb_build_array(),
      'players', jsonb_build_array(
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000001', 'displayName', 'Editor 1', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', true),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000006', 'displayName', 'Editor 6', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000003', 'displayName', 'Editor 3', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000008', 'displayName', 'Editor 8', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false)
      )
    ),
    jsonb_build_object(
      'courtNumber', 2, 'startAt', '00:31', 'endAt', '01:01',
      'teamA', jsonb_build_array(), 'teamB', jsonb_build_array(),
      'players', jsonb_build_array(
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000005', 'displayName', 'Editor 5', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000002', 'displayName', 'Editor 2', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000007', 'displayName', 'Editor 7', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false),
        jsonb_build_object('id', 'f6000000-0000-4000-8000-000000000004', 'displayName', 'Editor 4', 'priority', 1, 'friendIds', '[]'::jsonb, 'isCommittee', false)
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
    where session.id = 'f7000000-0000-4000-8000-000000000001'
  ) - interval '30 minutes',
  'the session is past its release time'
);

-- Only administrators may edit.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f6000000-0000-4000-8000-000000000002","email":"edit-2@atu.ie","role":"authenticated"}', true);
select throws_ok(
  $$ select public.admin_swap_session_players(
       'f7000000-0000-4000-8000-000000000001',
       'f6000000-0000-4000-8000-000000000001',
       'f6000000-0000-4000-8000-000000000005',
       'member attempt'
     ) $$,
  '42501',
  'Only a club administrator can repair a timetable.',
  'a plain member cannot swap players'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.admin_swap_session_players(uuid,uuid,uuid,text)', 'execute'),
  'anonymous visitors cannot call the editor'
);

-- An administrator can swap two players across every round, even after release.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f6000000-0000-4000-8000-000000000001","email":"edit-1@atu.ie","role":"authenticated"}', true);
select lives_ok(
  $$ select public.admin_swap_session_players(
       'f7000000-0000-4000-8000-000000000001',
       'f6000000-0000-4000-8000-000000000001',
       'f6000000-0000-4000-8000-000000000005',
       'they wanted to play together'
     ) $$,
  'an administrator can swap players in a released timetable'
);
reset role;

select is(
  (
    select count(*)
    from public.session_timetables as timetable
    cross join lateral jsonb_array_elements(timetable.court_schedule) as game
    cross join lateral jsonb_array_elements(game -> 'players') as player
    where timetable.session_id = 'f7000000-0000-4000-8000-000000000001'
      and private.timetable_player_id(player) = 'f6000000-0000-4000-8000-000000000001'
      and (game ->> 'courtNumber')::int = 2
  ),
  2::bigint,
  'the first player now plays both rounds on court 2'
);

select is(
  (
    select count(*)
    from public.session_timetables as timetable
    cross join lateral jsonb_array_elements(timetable.court_schedule) as game
    cross join lateral jsonb_array_elements(game -> 'players') as player
    where timetable.session_id = 'f7000000-0000-4000-8000-000000000001'
      and private.timetable_player_id(player) = 'f6000000-0000-4000-8000-000000000005'
      and (game ->> 'courtNumber')::int = 1
  ),
  2::bigint,
  'the second player now plays both rounds on court 1'
);

select is(
  (
    select count(*)
    from public.session_timetables as timetable
    cross join lateral jsonb_array_elements(timetable.court_schedule) as game
    where timetable.session_id = 'f7000000-0000-4000-8000-000000000001'
      and jsonb_array_length(game -> 'teamA') <> 2
  ),
  0::bigint,
  'every game is rebuilt as two teams of two'
);

select is(
  (
    select details ->> 'reason' from public.admin_audit_log
    where action = 'swap-seats'
  ),
  'they wanted to play together',
  'the reason is recorded'
);

select is(
  (
    select (details ->> 'was_locked')::boolean from public.admin_audit_log
    where action = 'swap-seats'
  ),
  true,
  'the audit notes that the timetable had already been released'
);

-- A player can be taken out; they move to the waitlist and every seat clears.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f6000000-0000-4000-8000-000000000001","email":"edit-1@atu.ie","role":"authenticated"}', true);
select lives_ok(
  $$ select public.admin_remove_session_player(
       'f7000000-0000-4000-8000-000000000001',
       'f6000000-0000-4000-8000-000000000003',
       'knee injury'
     ) $$,
  'an administrator can take a player out'
);
reset role;

select is(
  (
    select status from public.session_signups
    where session_id = 'f7000000-0000-4000-8000-000000000001'
      and user_id = 'f6000000-0000-4000-8000-000000000003'
  ),
  'waitlisted',
  'the removed player moves to the waitlist'
);

select ok(
  not exists (
    select 1
    from public.session_timetables as timetable
    cross join lateral jsonb_array_elements(timetable.court_schedule) as game
    cross join lateral jsonb_array_elements(game -> 'players') as player
    where timetable.session_id = 'f7000000-0000-4000-8000-000000000001'
      and private.timetable_player_id(player) = 'f6000000-0000-4000-8000-000000000003'
  ),
  'the removed player is gone from every game'
);

-- A member can be placed into the seat that just opened up.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f6000000-0000-4000-8000-000000000001","email":"edit-1@atu.ie","role":"authenticated"}', true);
select lives_ok(
  $$ select public.admin_place_session_player(
       'f7000000-0000-4000-8000-000000000001',
       'f6000000-0000-4000-8000-000000000009',
       1,
       '00:31',
       'late arrival'
     ) $$,
  'an administrator can place a waiting member'
);
reset role;

select is(
  (
    select status from public.session_signups
    where session_id = 'f7000000-0000-4000-8000-000000000001'
      and user_id = 'f6000000-0000-4000-8000-000000000009'
  ),
  'selected',
  'the placed member becomes selected'
);

select ok(
  exists (
    select 1
    from public.session_timetables as timetable
    cross join lateral jsonb_array_elements(timetable.court_schedule) as game
    cross join lateral jsonb_array_elements(game -> 'players') as player
    where timetable.session_id = 'f7000000-0000-4000-8000-000000000001'
      and private.timetable_player_id(player) = 'f6000000-0000-4000-8000-000000000009'
  ),
  'the placed member appears in the timetable'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f6000000-0000-4000-8000-000000000001","email":"edit-1@atu.ie","role":"authenticated"}', true);
select throws_ok(
  $$ select public.admin_place_session_player(
       'f7000000-0000-4000-8000-000000000001',
       'f6000000-0000-4000-8000-000000000010',
       2,
       '00:01',
       'trying a full court'
     ) $$,
  '22023',
  'That court is full. Swap two players instead.',
  'a full court refuses another player'
);
reset role;

select is(
  (
    select count(*) from public.admin_audit_log
    where action in ('swap-seats', 'remove-player', 'place-player')
  ),
  3::bigint,
  'each edit is audited once'
);

select * from finish();
rollback;
