begin;

select plan(45);

alter table public.sessions drop constraint sessions_capacity_check;

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  ('20000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'matching-player-' || player_number || '@atu.ie',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from generate_series(1, 25) as player_number;

update auth.users
set email = 'g00440629@atu.ie'
where id = '20000000-0000-4000-8000-000000000025';

insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity,
  signup_opens_at, confirmation_at, status
)
select session.id, session.event_date, session.starts_at,
  session.duration_minutes, session.capacity, now() - interval '1 day',
  case
    when session.id = '30000000-0000-4000-8000-000000000005'::uuid
      then now() + interval '1 day'
    else now() - interval '1 minute'
  end,
  'open'
from (
  values
    ('30000000-0000-4000-8000-000000000001'::uuid, date_trunc('week', now() at time zone 'Europe/London')::date + 7, time '18:00', 60::smallint, 4::smallint),
    ('30000000-0000-4000-8000-000000000002'::uuid, date_trunc('week', now() at time zone 'Europe/London')::date + 9, time '20:00', 120::smallint, 8::smallint),
    ('30000000-0000-4000-8000-000000000003'::uuid, date_trunc('week', now() at time zone 'Europe/London')::date + 14, time '18:00', 60::smallint, 4::smallint),
    ('30000000-0000-4000-8000-000000000004'::uuid, date_trunc('week', now() at time zone 'Europe/London')::date + 16, time '20:00', 120::smallint, 4::smallint),
    ('30000000-0000-4000-8000-000000000005'::uuid, date_trunc('week', now() at time zone 'Europe/London')::date + 21, time '18:00', 60::smallint, 4::smallint),
    ('30000000-0000-4000-8000-000000000006'::uuid, date_trunc('week', now() at time zone 'Europe/London')::date + 23, time '20:00', 120::smallint, 8::smallint)
) as session(id, event_date, starts_at, duration_minutes, capacity);

update public.profiles
set last_played_at = '2010-01-01 00:00:00+00'::timestamptz
  + (right(id::text, 12)::integer - 1) * interval '1 day'
where id::text like '20000000-0000-4000-8000-%';

update public.profiles
set player_level = case
  when right(id::text, 12)::integer between 1 and 3 then 'BEGINNER'
  when right(id::text, 12)::integer between 4 and 6 then 'INTERMEDIATE'
  when right(id::text, 12)::integer between 7 and 8 then 'PROFESSIONAL'
  when right(id::text, 12)::integer between 17 and 20 then 'BEGINNER'
  else 'INTERMEDIATE'
end;

update public.profiles
set player_level = 'PROFESSIONAL',
    is_committee = true
where id = '20000000-0000-4000-8000-000000000016';

update public.profiles
set last_played_at = '2020-01-01 00:00:00+00'
where id = '20000000-0000-4000-8000-000000000016';

update public.profiles
set last_played_at = case right(id::text, 12)::integer
  when 10 then '2010-01-01 00:00:00+00'::timestamptz
  when 11 then '2020-02-01 00:00:00+00'::timestamptz
  else '2020-01-10 00:00:00+00'::timestamptz
    + (right(id::text, 12)::integer - 12) * interval '1 day'
end
where id::text like '20000000-0000-4000-8000-%'
  and right(id::text, 12)::integer between 10 and 15;

update public.profiles
set last_played_at = case right(id::text, 12)::integer
  when 17 then '2010-01-01 00:00:00+00'::timestamptz
  when 18 then '2020-10-01 00:00:00+00'::timestamptz
  when 19 then '2010-01-02 00:00:00+00'::timestamptz
  when 20 then '2020-09-01 00:00:00+00'::timestamptz
  else '2020-08-01 00:00:00+00'::timestamptz
end
where id::text like '20000000-0000-4000-8000-%'
  and right(id::text, 12)::integer between 17 and 24;

insert into public.session_signups (session_id, user_id, status)
select '30000000-0000-4000-8000-000000000001',
  ('20000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'requested'
from unnest(array[1, 2, 3, 4, 5, 16]) as player_number;

insert into public.session_signups (session_id, user_id, status)
select '30000000-0000-4000-8000-000000000002',
  ('20000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'requested'
from generate_series(1, 8) as player_number;

insert into public.session_signups (session_id, user_id, status)
select '30000000-0000-4000-8000-000000000003',
  ('20000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'requested'
from generate_series(10, 15) as player_number;

insert into public.session_signups (session_id, user_id, status)
select '30000000-0000-4000-8000-000000000004',
  ('20000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'requested'
from generate_series(17, 24) as player_number;

insert into public.session_signups (session_id, user_id, status)
select '30000000-0000-4000-8000-000000000006',
  ('20000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'requested'
from generate_series(17, 24) as player_number;

insert into public.session_friend_preferences (session_id, user_id, friend_user_id)
values
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000006'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000008'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000009'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000011'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000017', '20000000-0000-4000-8000-000000000018'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000019', '20000000-0000-4000-8000-000000000020');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.session_friend_preferences'::regclass),
  'friend preferences have row-level security enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.session_friend_preferences', 'select'),
  'members cannot directly read friend preference records'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_committee', 'update'),
  'members cannot change their committee role directly'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_committee_admin', 'update'),
  'members cannot grant themselves administrator access'
);
select is(
  (select count(*) from public.session_friend_preferences
   where session_id = '30000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the no-friends signup keeps no friend preference rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000015',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000015","email":"matching-player-15@atu.ie","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.update_my_player_level('PROFESSIONAL')$$,
  '22023',
  'Professional level is assigned by a club administrator.',
  'members cannot self-select Professional level'
);
select lives_ok(
  $$select public.update_my_player_level('BEGINNER')$$,
  'members can select Beginner level'
);
select lives_ok(
  $$select public.update_my_player_level('INTERMEDIATE')$$,
  'members can select Intermediate level'
);
select throws_ok(
  $$select public.admin_update_player_access(
    '20000000-0000-4000-8000-000000000001',
    'PROFESSIONAL',
    false
  )$$,
  '42501',
  'Only a club administrator can change player access.',
  'members cannot assign another player Professional level or committee status'
);
select throws_ok(
  $$select public.request_session_signup(
    '30000000-0000-4000-8000-000000000005',
    array[
      '20000000-0000-4000-8000-000000000001'::uuid,
      '20000000-0000-4000-8000-000000000002'::uuid,
      '20000000-0000-4000-8000-000000000003'::uuid,
      '20000000-0000-4000-8000-000000000004'::uuid
    ]
  )$$,
  '22023',
  'Select no more than three friends.',
  'the database rejects more than three selected friends'
);
select lives_ok(
  $$select public.request_session_signup(
    '30000000-0000-4000-8000-000000000005',
    array['20000000-0000-4000-8000-000000000016'::uuid]
  )$$,
  'a signup succeeds when its selected friend has no request for that session'
);
reset role;

select is(
  (select count(*) from public.session_friend_preferences
   where session_id = '30000000-0000-4000-8000-000000000005'
     and user_id = '20000000-0000-4000-8000-000000000015'),
  1::bigint,
  'the available requester preference is retained without requiring the friend to sign up'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000015',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000015","email":"matching-player-15@atu.ie","role":"authenticated"}',
  true
);
select is(
  (select user_id::text
   from public.find_club_member_by_student_id(' G00440629 ')
   limit 1),
  '20000000-0000-4000-8000-000000000025',
  'members can look up a registered club account by case-insensitive student ID'
);
select is(
  (select count(*)::integer
   from public.find_club_member_by_student_id('notarealstudent')),
  0,
  'a missing student ID returns no account details'
);
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000025',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000025","email":"g00440629@atu.ie","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer
   from public.find_club_member_by_student_id('g00440629')),
  0,
  'members cannot select themselves'
);
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000015',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000015","email":"matching-player-15@atu.ie","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer
   from public.get_session_friend_preferences(
     '30000000-0000-4000-8000-000000000005'
   )),
  1,
  'saved preferences return only the current member selected for that session'
);
select is(
  (select student_id
   from public.get_session_friend_preferences(
     '30000000-0000-4000-8000-000000000005'
   )
   limit 1),
  'matching-player-16',
  'saved friend details include the student ID needed to render the selection'
);
select lives_ok(
  $$select public.update_session_friend_preferences(
    '30000000-0000-4000-8000-000000000005',
    array['20000000-0000-4000-8000-000000000017'::uuid]
  )$$,
  'a signed-up member can update friend preferences before confirmation'
);
select is(
  (select user_id::text
   from public.get_session_friend_preferences(
     '30000000-0000-4000-8000-000000000005'
   )
   limit 1),
  '20000000-0000-4000-8000-000000000017',
  'updating preferences replaces the previous selected friends'
);
select throws_ok(
  $$select public.update_session_friend_preferences(
    '30000000-0000-4000-8000-000000000005',
    array[
      '20000000-0000-4000-8000-000000000001'::uuid,
      '20000000-0000-4000-8000-000000000002'::uuid,
      '20000000-0000-4000-8000-000000000003'::uuid,
      '20000000-0000-4000-8000-000000000004'::uuid
    ]
  )$$,
  '22023',
  'Select no more than three friends.',
  'the update RPC rejects more than three selected friends'
);
select throws_ok(
  $$select public.update_session_friend_preferences(
    '30000000-0000-4000-8000-000000000005',
    array['20000000-0000-4000-8000-000000000015'::uuid]
  )$$,
  '22023',
  'Select existing ATU club members only.',
  'the update RPC rejects selecting yourself'
);
reset role;
update public.sessions
set confirmation_at = now() + interval '1 day'
where id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$select public.update_session_friend_preferences(
    '30000000-0000-4000-8000-000000000001',
    '{}'::uuid[]
  )$$,
  'P0001',
  'You need an active session signup to update friend choices.',
  'members cannot update preferences for another signup'
);
reset role;
update public.sessions
set confirmation_at = now() - interval '1 minute'
where id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(
  not has_function_privilege(
    'anon',
    'public.update_session_friend_preferences(uuid,uuid[])',
    'execute'
  ),
  'anonymous users cannot update session friend preferences'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.find_club_member_by_student_id(text)',
    'execute'
  ),
  'authenticated club members can use the protected student ID lookup'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.find_club_member_by_student_id(text)',
    'execute'
  ),
  'anonymous users cannot use the student ID lookup'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_session_friend_preferences(uuid)',
    'execute'
  ),
  'anonymous users cannot retrieve saved friend preferences'
);
select is(
  to_regprocedure('public.get_friend_candidates(uuid)') is null,
  true,
  'the old unrestricted friend directory RPC is removed'
);
reset role;

update public.sessions
set confirmation_at = now() - interval '1 minute'
where id = '30000000-0000-4000-8000-000000000005';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000015',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000015","email":"matching-player-15@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.finalize_due_sessions()$$,
  'an authenticated club member can finalize the matching test sessions'
);
reset role;

select is(
  (select status from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000001'
     and user_id = '20000000-0000-4000-8000-000000000016'),
  'selected',
  'an eligible committee member is selected ahead of members who have waited longer'
);
select is(
  (select count(*) from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000001'
     and status = 'selected'),
  4::bigint,
  'committee priority still respects the four-place session capacity'
);
select is(
  (select count(distinct profile.player_level)
   from public.session_signups as signup
   join public.profiles as profile on profile.id = signup.user_id
   where signup.session_id = '30000000-0000-4000-8000-000000000001'
     and signup.status = 'selected'),
  2::bigint,
  'committee priority can form a court with players at different levels'
);
select is(
  (select count(*) from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000002'
     and status = 'selected'),
  8::bigint,
  'mixed-level applicants fill all available places'
);
select is(
  (select count(distinct slot_number) from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000002'
     and status = 'selected'),
  2::bigint,
  'eight selected players form two courts'
);
select is(
  (select count(*) from public.session_signups as signup
   join public.session_friend_preferences as preference
     on preference.session_id = signup.session_id
     and preference.user_id = signup.user_id
   where signup.session_id = '30000000-0000-4000-8000-000000000002'
     and signup.slot_number = (
       select slot_number from public.session_signups
       where session_id = '30000000-0000-4000-8000-000000000002'
         and user_id = '20000000-0000-4000-8000-000000000001'
     )
     and preference.friend_user_id = any(array[
       '20000000-0000-4000-8000-000000000002'::uuid,
       '20000000-0000-4000-8000-000000000003'::uuid,
       '20000000-0000-4000-8000-000000000004'::uuid
     ])),
  3::bigint,
  'a player and all three selected friends are placed in one four-player court'
);
select is(
  (select count(*) from public.session_friend_preferences
   where session_id = '30000000-0000-4000-8000-000000000002'
     and user_id = '20000000-0000-4000-8000-000000000005'),
  1::bigint,
  'one selected friend is retained'
);
select is(
  (select count(*) from public.session_friend_preferences
   where session_id = '30000000-0000-4000-8000-000000000002'
     and user_id = '20000000-0000-4000-8000-000000000007'),
  2::bigint,
  'two selected friends are retained including one unavailable signup'
);
select is(
  (select count(*) from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000002'
     and status in ('selected', 'played')
     and slot_number in (1, 2)),
  8::bigint,
  'no-friend, one-friend, two-friend and three-friend requests still fill complete courts'
);
select is(
  (select count(*) from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000003'
     and status = 'selected'),
  4::bigint,
  'players outside an unavailable friend group fill every place'
);
select is(
  (select status from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000003'
     and user_id = '20000000-0000-4000-8000-000000000010'),
  'waitlisted',
  'a friend group uses the most recent eligible member history for priority'
);
select is(
  (select status from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000003'
     and user_id = '20000000-0000-4000-8000-000000000011'),
  'waitlisted',
  'the recently played friend is not selected ahead of longer-waiting solo players'
);
select is(
  (select count(*) from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000004'
     and status = 'selected'),
  4::bigint,
  'competing friend groups do not leave eligible places empty'
);
select is(
  (select count(*) from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000004'
     and user_id between '20000000-0000-4000-8000-000000000021'::uuid
       and '20000000-0000-4000-8000-000000000024'::uuid
     and status = 'selected'),
  4::bigint,
  'competing friend groups cannot bypass players with older play history'
);
select is(
  (select count(*) from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000005'
     and user_id = '20000000-0000-4000-8000-000000000015'
     and status = 'selected'),
  1::bigint,
  'the requester is not rejected because their selected friend is unavailable'
);
select is(
  (select count(*) from public.session_signups
   where session_id = '30000000-0000-4000-8000-000000000006'
     and status = 'selected'),
  8::bigint,
  'players with limited same-level availability are still selected'
);
select is(
  (select count(*) from (
    select slot_number
    from public.session_signups as signup
    join public.profiles as profile on profile.id = signup.user_id
    where signup.session_id = '30000000-0000-4000-8000-000000000006'
      and signup.status = 'selected'
    group by slot_number
    having count(*) = 4 and count(distinct player_level) = 1
  ) as same_level_courts),
  2::bigint,
  'same-level complete courts are preferred when enough players are available'
);

select * from finish();
rollback;
