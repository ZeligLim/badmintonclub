begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- Two members: one who has confirmed a level, one who has not. The gate must
-- only affect new sign-ups, never an existing place.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (
    'f8000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'level-confirmed@atu.ie',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    'f8000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'level-unconfirmed@atu.ie',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

update public.profiles
set level_confirmed_at = now(),
    player_level = 'ADVANCED'
where id = 'f8000000-0000-4000-8000-000000000001';

-- The existing place of the unconfirmed member: it must survive the gate.
insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity,
  signup_opens_at, confirmation_at, status, allocation_mode, fee_cents, committee_auto_signup
)
values (
  'f8100000-0000-4000-8000-000000000001',
  (date_trunc('week', now() at time zone 'Europe/London')::date + 40),
  time '19:30', 60, 8,
  now() - interval '2 days', now() + interval '1 day',
  'open', 'lottery', 0, false
);

insert into public.session_signups (session_id, user_id, status, slot_number, signed_up_at)
values (
  'f8100000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000002',
  'selected', 1, now() - interval '1 day'
);

-- 1-3: four levels, beginner default, and the rank helper.
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_player_level_check'
      and pg_get_constraintdef(oid) like '%ADVANCED%'
  ),
  'the level check accepts ADVANCED'
);
select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'player_level'),
  '''BEGINNER''::text',
  'new members start at beginner'
);
select is(private.player_level_rank('ADVANCED'), 3, 'advanced ranks between beginner and professional');

-- 4-6: the unconfirmed member is gated but keeps the place they already have.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000002","role":"authenticated","email":"level-unconfirmed@atu.ie"}', true);
select is(
  (select count(*)::integer from public.session_signups
   where session_id = 'f8100000-0000-4000-8000-000000000001'
     and user_id = 'f8000000-0000-4000-8000-000000000002'),
  1,
  'an existing place is kept for an unconfirmed member'
);
select throws_ok(
  $$select public.request_session_signup('f8100000-0000-4000-8000-000000000001')$$,
  'P0001',
  'Confirm your playing level before signing up.',
  'an unconfirmed member cannot take a new place'
);
select lives_ok(
  $$select public.update_my_player_level('BEGINNER')$$,
  'the member can confirm a level'
);

-- 7-9: after confirming, the same member can sign up and the level is stored.
select throws_ok(
  $$select public.request_session_signup('f8100000-0000-4000-8000-000000000001')$$,
  'P0001',
  'You already have a place or waitlist request.',
  'an existing place is reported as a duplicate, never as an unconfirmed level'
);
reset role;
select is(
  (select player_level from public.profiles where id = 'f8000000-0000-4000-8000-000000000002'),
  'BEGINNER',
  'the chosen level is stored'
);
select ok(
  (select level_confirmed_at is not null from public.profiles where id = 'f8000000-0000-4000-8000-000000000002'),
  'confirming stamps the one-way checked flag'
);

-- 10-12: the matching order is a validated club setting.
select is(
  (select priority from public.matching_settings),
  array['committee', 'level', 'friends'],
  'the club starts with committee, level, friends'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000002","role":"authenticated","email":"level-unconfirmed@atu.ie"}', true);
select throws_ok(
  $$select public.admin_set_matching_priority(array['level', 'level', 'friends'])$$,
  '42501',
  'Only a club administrator can change the matching order.',
  'a plain member cannot change the order'
);
reset role;
update public.profiles set is_committee_admin = true
where id = 'f8000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-4000-8000-000000000001","role":"authenticated","email":"level-confirmed@atu.ie"}', true);
select throws_ok(
  $$select public.admin_set_matching_priority(array['level', 'level', 'friends'])$$,
  '22023',
  'The matching order must list committee, level and friends once each.',
  'a duplicate order is rejected'
);
select lives_ok(
  $$select public.admin_set_matching_priority(array['level', 'committee', 'friends'])$$,
  'an administrator can reorder the priorities'
);
reset role;
select is(
  (select priority from public.matching_settings),
  array['level', 'committee', 'friends'],
  'the new order is stored'
);

-- 13-14: a saved timetable remembers the order it was built with.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.save_session_timetable(
    'f8100000-0000-4000-8000-000000000001',
    '[]'::jsonb,
    null,
    array['level', 'committee', 'friends']
  ),
  1,
  'saving a timetable returns its first version'
);
reset role;
select is(
  (select matching_priority from public.session_timetables
   where session_id = 'f8100000-0000-4000-8000-000000000001'),
  array['level', 'committee', 'friends'],
  'the saved timetable records the matching order'
);

select * from finish();
rollback;
