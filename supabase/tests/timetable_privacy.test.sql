begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- A migration seeds sessions for the current and next club week when it runs,
-- so start from an empty schedule before inserting fixtures.
delete from public.sessions;

-- Two members: one with a signup and saved friendship, used for the privacy and
-- invalidation checks.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'timetable-one@atu.ie', crypt('password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'timetable-two@atu.ie', crypt('password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- The auth trigger already created both profiles; name them for readability.
update public.profiles
set display_name = 'Timetable One', player_level = 'INTERMEDIATE'
where id = 'e1000000-0000-4000-8000-000000000001';

update public.profiles
set display_name = 'Timetable Two', player_level = 'INTERMEDIATE'
where id = 'e1000000-0000-4000-8000-000000000002';

-- An unlocked session two weeks out and a locked one that already started.
insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity,
  signup_opens_at, confirmation_at, status, allocation_mode, fee_cents, committee_auto_signup
)
values
  (
    'e2000000-0000-4000-8000-000000000001',
    date_trunc('week', now() at time zone 'Europe/London')::date + 9,
    time '19:00', 60, 8, now() - interval '1 day', now() + interval '2 days',
    'open', 'lottery', 0, false
  ),
  (
    'e2000000-0000-4000-8000-000000000002',
    date_trunc('week', now() at time zone 'Europe/London')::date - 7,
    time '19:00', 60, 8, now() - interval '9 days', now() - interval '8 days',
    'confirmed', 'lottery', 0, false
  );

insert into public.session_signups (session_id, user_id, status, slot_number)
values ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'selected', 1);

insert into public.session_timetables (session_id, court_schedule)
values
  ('e2000000-0000-4000-8000-000000000001', '[]'::jsonb),
  ('e2000000-0000-4000-8000-000000000002', '[{"courtNumber":1,"startAt":"19:00","endAt":"19:15"}]'::jsonb);

-- Anonymous visitors cannot read or derive the saved court assignments.
set local role anon;
select throws_ok(
  $$select count(*) from public.session_timetables$$,
  '42501',
  null,
  'anonymous visitors cannot read saved timetables'
);
select throws_ok(
  $$select * from public.get_schedule_inputs(array['e2000000-0000-4000-8000-000000000001'::uuid])$$,
  '42501',
  null,
  'anonymous visitors cannot read roster inputs'
);
reset role;

-- A club member can read the timetable for the sessions they can see.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000001","email":"timetable-one@atu.ie","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.session_timetables),
  2::bigint,
  'a signed-in club member can read saved timetables'
);
reset role;

-- Changing a saved friend choice drops the timetable for that session while it
-- is still editable, because the grouping it was built from is now different.
insert into public.session_friend_preferences (session_id, user_id, friend_user_id)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002'
);

select is(
  (
    select count(*)
    from public.session_timetables
    where session_id = 'e2000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'changing a friend preference invalidates an unlocked timetable'
);

-- A released timetable is authoritative, so the same change leaves it alone.
insert into public.session_signups (session_id, user_id, status)
values ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'requested');

insert into public.session_friend_preferences (session_id, user_id, friend_user_id)
values (
  'e2000000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002'
);

select is(
  (
    select count(*)
    from public.session_timetables
    where session_id = 'e2000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'a released timetable is never invalidated by a friend change'
);

-- A club-friend change affects every still-editable session the member is in.
insert into public.session_timetables (session_id, court_schedule)
values ('e2000000-0000-4000-8000-000000000001', '[]'::jsonb);

insert into public.club_friend_list (user_id, friend_user_id)
values ('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002');

select is(
  (
    select count(*)
    from public.session_timetables
    where session_id = 'e2000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'changing the club friend list invalidates the member''s unlocked timetables'
);

select is(
  (
    select count(*)
    from public.session_timetables
    where session_id = 'e2000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'changing the club friend list leaves released timetables alone'
);

-- Only a committee administrator may rewrite a saved timetable.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000001","email":"timetable-one@atu.ie","role":"authenticated"}',
  true
);
update public.session_timetables
set court_schedule = '[]'::jsonb
where session_id = 'e2000000-0000-4000-8000-000000000002';

select is(
  (
    select court_schedule
    from public.session_timetables
    where session_id = 'e2000000-0000-4000-8000-000000000002'
  ),
  '[{"courtNumber":1,"startAt":"19:00","endAt":"19:15"}]'::jsonb,
  'a signed-in member cannot rewrite a released timetable'
);
reset role;

select * from finish();
rollback;
