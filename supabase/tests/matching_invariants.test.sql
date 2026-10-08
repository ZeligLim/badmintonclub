begin;

select no_plan();

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
  ('21000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'matching-invariant-' || player_number || '@atu.ie',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from generate_series(1, 22) as player_number;

update public.profiles
set last_played_at = case right(id::text, 12)::integer
    when 1 then '2025-01-01 00:00:00+00'::timestamptz
    when 2 then '2010-01-01 00:00:00+00'::timestamptz
    when 3 then '2011-01-01 00:00:00+00'::timestamptz
    when 4 then '2012-01-01 00:00:00+00'::timestamptz
    when 5 then '2013-01-01 00:00:00+00'::timestamptz
    when 6 then '2009-01-01 00:00:00+00'::timestamptz
    when 7 then '2014-01-01 00:00:00+00'::timestamptz
    when 8 then '2015-01-01 00:00:00+00'::timestamptz
    when 9 then '2016-01-01 00:00:00+00'::timestamptz
    when 10 then '2017-01-01 00:00:00+00'::timestamptz
    when 11 then '2018-01-01 00:00:00+00'::timestamptz
    when 12 then '2019-01-01 00:00:00+00'::timestamptz
    when 13 then '2020-01-01 00:00:00+00'::timestamptz
    when 14 then '2021-01-01 00:00:00+00'::timestamptz
    when 15 then '2022-01-01 00:00:00+00'::timestamptz
    when 16 then '2023-01-01 00:00:00+00'::timestamptz
    else '2001-01-01 00:00:00+00'::timestamptz
  end,
  player_level = case
    when right(id::text, 12)::integer between 1 and 5 then 'BEGINNER'
    when right(id::text, 12)::integer between 7 and 10 then 'INTERMEDIATE'
    when right(id::text, 12)::integer between 11 and 16
      and right(id::text, 12)::integer <> 12 then 'PROFESSIONAL'
    else 'INTERMEDIATE'
  end,
  is_committee = right(id::text, 12)::integer = 1,
  is_committee_admin = right(id::text, 12)::integer = 11
where id::text like '21000000-0000-4000-8000-%';

update public.profiles
set last_played_at = '2001-01-01 00:00:00+00'::timestamptz
where id::text between
  '21000000-0000-4000-8000-000000000017'
  and '21000000-0000-4000-8000-000000000022';

alter table public.sessions drop constraint sessions_capacity_check;

insert into public.sessions (
  id,
  event_date,
  starts_at,
  duration_minutes,
  capacity,
  signup_opens_at,
  confirmation_at,
  status
)
select
  test_session.id,
  date_trunc('week', now() at time zone 'Europe/London')::date
    + test_session.day_offset,
  test_session.starts_at,
  test_session.duration_minutes,
  test_session.capacity,
  now() - interval '2 days',
  now() + interval '1 day',
  'open'
from (
  values
    ('31000000-0000-4000-8000-000000000001'::uuid, 28, time '18:00', 60::smallint, 4::smallint),
    ('31000000-0000-4000-8000-000000000002'::uuid, 30, time '20:00', 120::smallint, 8::smallint),
    ('31000000-0000-4000-8000-000000000003'::uuid, 35, time '18:00', 60::smallint, 4::smallint),
    ('31000000-0000-4000-8000-000000000004'::uuid, 16, time '20:00', 120::smallint, 4::smallint)
) as test_session(id, day_offset, starts_at, duration_minutes, capacity);

insert into public.session_signups (session_id, user_id, status)
select
  '31000000-0000-4000-8000-000000000001',
  ('21000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'requested'
from generate_series(3, 6) as player_number;

insert into public.session_signups (session_id, user_id, status)
select
  '31000000-0000-4000-8000-000000000002',
  ('21000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'requested'
from unnest(array[8, 9, 10, 11, 12, 13, 14, 15, 16]) as player_number;

insert into public.session_signups (
  session_id,
  user_id,
  status,
  signed_up_at
)
select
  '31000000-0000-4000-8000-000000000004',
  ('21000000-0000-4000-8000-' || lpad(signup.player_number::text, 12, '0'))::uuid,
  'requested',
  signup.signed_up_at
from (
  values
    (17, '2020-01-01 00:00:00+00'::timestamptz),
    (18, '2020-01-02 00:00:00+00'::timestamptz),
    (19, '2020-01-03 00:00:00+00'::timestamptz),
    (20, '2020-01-03 00:00:00+00'::timestamptz),
    (21, '2020-01-04 00:00:00+00'::timestamptz),
    (22, '2020-01-04 00:00:00+00'::timestamptz)
) as signup(player_number, signed_up_at);

insert into public.session_friend_preferences (
  session_id,
  user_id,
  friend_user_id
)
values
  (
    '31000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000009',
    '21000000-0000-4000-8000-000000000010'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000001","email":"matching-invariant-1@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '31000000-0000-4000-8000-000000000001',
    '{}'::uuid[]
  )$$,
  'a committee member can sign up without friend preferences'
);
reset role;
select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '31000000-0000-4000-8000-000000000001'
      and user_id = '21000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'a signup with no friend preferences stores no preference rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000002","email":"matching-invariant-2@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '31000000-0000-4000-8000-000000000001',
    array['21000000-0000-4000-8000-000000000006'::uuid]
  )$$,
  'signup succeeds with a friend preference whose friend later becomes ineligible'
);
reset role;
select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '31000000-0000-4000-8000-000000000001'
      and user_id = '21000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'the ineligible friend preference was accepted at signup time'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000007',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000007","email":"matching-invariant-7@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '31000000-0000-4000-8000-000000000003',
    array[
      '21000000-0000-4000-8000-000000000008'::uuid,
      '21000000-0000-4000-8000-000000000008'::uuid,
      '21000000-0000-4000-8000-000000000007'::uuid
    ]
  )$$,
  'signup accepts duplicate preference input and self-selection without storing either invalid duplicate'
);
reset role;
select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '31000000-0000-4000-8000-000000000003'
      and user_id = '21000000-0000-4000-8000-000000000007'
  ),
  1::bigint,
  'duplicate friend IDs are stored once'
);
select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '31000000-0000-4000-8000-000000000003'
      and user_id = '21000000-0000-4000-8000-000000000007'
      and friend_user_id = user_id
  ),
  0::bigint,
  'a member cannot save themself as a friend'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000008',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000008","email":"matching-invariant-8@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '31000000-0000-4000-8000-000000000003',
    array[
      '21000000-0000-4000-8000-000000000007'::uuid,
      '21000000-0000-4000-8000-000000000009'::uuid,
      '21000000-0000-4000-8000-000000000010'::uuid
    ]
  )$$,
  'three friend preferences are accepted'
);
reset role;
select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '31000000-0000-4000-8000-000000000003'
      and user_id = '21000000-0000-4000-8000-000000000008'
  ),
  3::bigint,
  'the maximum supported friend group of three is persisted'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000009',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000009","email":"matching-invariant-9@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '31000000-0000-4000-8000-000000000003',
    array['21000000-0000-4000-8000-000000000007'::uuid]
  )$$,
  'one friend preference is accepted'
);
reset role;
select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '31000000-0000-4000-8000-000000000003'
      and user_id = '21000000-0000-4000-8000-000000000009'
  ),
  1::bigint,
  'one friend preference is persisted'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000010',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000010","email":"matching-invariant-10@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '31000000-0000-4000-8000-000000000003',
    '{}'::uuid[]
  )$$,
  'zero friend preferences are accepted'
);
reset role;
select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '31000000-0000-4000-8000-000000000003'
      and user_id = '21000000-0000-4000-8000-000000000010'
  ),
  0::bigint,
  'zero friend preferences store no preference rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000011","email":"matching-invariant-11@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '31000000-0000-4000-8000-000000000003',
    array[
      '21000000-0000-4000-8000-000000000007'::uuid,
      '21000000-0000-4000-8000-000000000010'::uuid
    ]
  )$$,
  'two friend preferences are accepted'
);
reset role;
select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '31000000-0000-4000-8000-000000000003'
      and user_id = '21000000-0000-4000-8000-000000000011'
  ),
  2::bigint,
  'two friend preferences are persisted'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000012',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000012","email":"matching-invariant-12@atu.ie","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.request_session_signup(
    '31000000-0000-4000-8000-000000000003',
    array[
      '21000000-0000-4000-8000-000000000001'::uuid,
      '21000000-0000-4000-8000-000000000002'::uuid,
      '21000000-0000-4000-8000-000000000003'::uuid,
      '21000000-0000-4000-8000-000000000004'::uuid
    ]
  )$$,
  '22023',
  'Select no more than three friends.',
  'the server rejects more than three friends'
);
select throws_ok(
  $$select public.update_my_player_level('PROFESSIONAL')$$,
  '22023',
  'Professional level is not available for this member.',
  'the server prevents members from selecting Professional level'
);

select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000011","email":"matching-invariant-11@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_update_player_access(
    '21000000-0000-4000-8000-000000000012',
    'PROFESSIONAL',
    false
  )$$,
  'an administrator can assign Professional level'
);
reset role;

update auth.users
set email = 'ineligible-player@example.test'
where id = '21000000-0000-4000-8000-000000000006';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000007',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000007","email":"matching-invariant-7@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '31000000-0000-4000-8000-000000000002',
    array[
      '21000000-0000-4000-8000-000000000008'::uuid,
      '21000000-0000-4000-8000-000000000009'::uuid
    ]
  )$$,
  'Student A joins the oversubscribed session and selects Students B and C'
);
reset role;
select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '31000000-0000-4000-8000-000000000002'
      and user_id = '21000000-0000-4000-8000-000000000007'
      and friend_user_id in (
        '21000000-0000-4000-8000-000000000008',
        '21000000-0000-4000-8000-000000000009'
      )
  ),
  2::bigint,
  'the signup RPC persisted exactly Student B and Student C preference IDs'
);

update public.sessions
set confirmation_at = now() - interval '1 minute'
where id in (
  '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000002',
  '31000000-0000-4000-8000-000000000003',
  '31000000-0000-4000-8000-000000000004'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-4000-8000-000000000007',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000007","email":"matching-invariant-7@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.finalize_due_sessions()$$,
  'eligible members can finalize all due test sessions'
);
reset role;
select is(
  (
    select status
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000001'
      and user_id = '21000000-0000-4000-8000-000000000001'
  ),
  'selected',
  'committee priority selects a committee member despite recent play history'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000001'
      and user_id = '21000000-0000-4000-8000-000000000002'
  ),
  'selected',
  'the requester remains eligible and is selected after their preferred friend becomes ineligible'
);
select is(
  (select count(*)::integer
   from public.session_signups
   where session_id = '31000000-0000-4000-8000-000000000001'
      and user_id = '21000000-0000-4000-8000-000000000006'
      and status = 'selected'),
  0,
  'a player who became ineligible after signup is not selected'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000001'
      and user_id = '21000000-0000-4000-8000-000000000006'
  ),
  'requested',
  'an ineligible signup is not modified during finalization'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000001'
      and status = 'selected'
  ),
  4::bigint,
  'four eligible players fill the first complete court'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000002'
      and status = 'selected'
  ),
  8::bigint,
  'an oversubscribed two-court session selects exactly its eight-place capacity'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000002'
      and status = 'waitlisted'
  ),
  2::bigint,
  'the two applicants with the most recent play history are waitlisted'
);
select is(
  (
    select count(distinct slot_number)
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000002'
      and status = 'selected'
  ),
  2::bigint,
  'eight selected players are assigned to two courts'
);
select is(
  (
    select count(*)
    from (
      select signup.slot_number
      from public.session_signups as signup
      join public.profiles as profile on profile.id = signup.user_id
      where signup.session_id = '31000000-0000-4000-8000-000000000002'
        and signup.status = 'selected'
      group by signup.slot_number
      having count(*) = 4 and count(distinct profile.player_level) = 1
    ) as compatible_courts
  ),
  2::bigint,
  'same-level complete courts are formed when enough players are available'
);
select is(
  (
    select count(*)
    from public.session_signups as first_player
    join public.session_signups as second_player
      on second_player.session_id = first_player.session_id
      and second_player.slot_number = first_player.slot_number
    where first_player.session_id = '31000000-0000-4000-8000-000000000002'
      and first_player.user_id = '21000000-0000-4000-8000-000000000007'
      and second_player.user_id = '21000000-0000-4000-8000-000000000008'
      and first_player.status = 'selected'
      and second_player.status = 'selected'
  ),
  1::bigint,
  'a selected friend pair shares a court when fairness permits'
);
select is(
  (
    select case
      when count(*) = 3 and count(distinct signup.slot_number) = 1 then 1
      else 0
    end
    from public.session_signups as signup
    where signup.session_id = '31000000-0000-4000-8000-000000000002'
      and signup.user_id in (
        '21000000-0000-4000-8000-000000000007',
        '21000000-0000-4000-8000-000000000008',
        '21000000-0000-4000-8000-000000000009'
      )
      and signup.status = 'selected'
  ),
  1,
  'the signup-selected pair and second friend are assigned together after finalization'
);
select is(
  (
    select count(*)
    from public.session_signups as first_player
    join public.session_signups as second_player
      on second_player.session_id = first_player.session_id
      and second_player.slot_number = first_player.slot_number
    where first_player.session_id = '31000000-0000-4000-8000-000000000002'
      and first_player.user_id = '21000000-0000-4000-8000-000000000009'
      and second_player.user_id = '21000000-0000-4000-8000-000000000010'
      and first_player.status = 'selected'
      and second_player.status = 'selected'
  ),
  1::bigint,
  'a second competing friend pair shares a court without bypassing fair selection'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000003'
      and status = 'selected'
  ),
  4::bigint,
  'friend preferences in an oversubscribed signup remain a preference, not eligibility'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000004'
      and status = 'selected'
  ),
  4::bigint,
  'the final tie-breaker fixture fills exactly one complete court'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000004'
      and user_id between
        '21000000-0000-4000-8000-000000000017'::uuid
        and '21000000-0000-4000-8000-000000000020'::uuid
      and status = 'selected'
  ),
  4::bigint,
  'signup time and UUID deterministically break equal fairness rankings'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '31000000-0000-4000-8000-000000000004'
      and user_id between
        '21000000-0000-4000-8000-000000000021'::uuid
        and '21000000-0000-4000-8000-000000000022'::uuid
      and status = 'waitlisted'
  ),
  2::bigint,
  'the newer signups with equal last-played history are waitlisted'
);
select is(
  (
    select count(*)
    from public.session_signups as signup
    join auth.users as club_user on club_user.id = signup.user_id
    where signup.session_id in (
      '31000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000002',
      '31000000-0000-4000-8000-000000000003',
      '31000000-0000-4000-8000-000000000004'
    )
      and signup.status = 'selected'
      and not private.is_club_email(club_user.email)
  ),
  0::bigint,
  'no ineligible account is selected in any test session'
);
select is(
  (
    select count(*)
    from (
      select session_id, user_id
      from public.session_signups
      where session_id in (
        '31000000-0000-4000-8000-000000000001',
        '31000000-0000-4000-8000-000000000002',
        '31000000-0000-4000-8000-000000000003',
        '31000000-0000-4000-8000-000000000004'
      )
        and status = 'selected'
      group by session_id, user_id
      having count(*) > 1
    ) as repeated_players
  ),
  0::bigint,
  'no player is selected more than once per session'
);
select is(
  (
    select coalesce(max(court_size), 0)
    from (
      select session_id, slot_number, count(*) as court_size
      from public.session_signups
      where session_id in (
        '31000000-0000-4000-8000-000000000001',
        '31000000-0000-4000-8000-000000000002',
        '31000000-0000-4000-8000-000000000003',
        '31000000-0000-4000-8000-000000000004'
      )
        and status = 'selected'
      group by session_id, slot_number
    ) as courts
  ),
  4::bigint,
  'court assignments never exceed four selected players'
);
select is(
  (
    select count(*)
    from (
      select session_id, slot_number
      from public.session_signups
      where session_id in (
        '31000000-0000-4000-8000-000000000001',
        '31000000-0000-4000-8000-000000000002',
        '31000000-0000-4000-8000-000000000003',
        '31000000-0000-4000-8000-000000000004'
      )
        and status = 'selected'
      group by session_id, slot_number
      having count(*) <> 4
    ) as incomplete_courts
  ),
  0::bigint,
  'every selected court is complete when enough eligible players fill capacity'
);
select is(
  (
    select count(*)
    from (
      select session_id, user_id
      from public.session_friend_preferences
      where session_id in (
        '31000000-0000-4000-8000-000000000001',
        '31000000-0000-4000-8000-000000000002',
        '31000000-0000-4000-8000-000000000003',
        '31000000-0000-4000-8000-000000000004'
      )
      group by session_id, user_id
      having count(*) > 3
    ) as oversized_preferences
  ),
  0::bigint,
  'no signup persists more than three friend preferences'
);
select is(
  (
    select count(*)
    from public.session_friend_preferences as preference
    join auth.users as friend_user on friend_user.id = preference.friend_user_id
    where preference.session_id = '31000000-0000-4000-8000-000000000001'
      and preference.user_id = '21000000-0000-4000-8000-000000000002'
      and not private.is_club_email(friend_user.email)
  ),
  1::bigint,
  'an ineligible friend preference may remain stored but is excluded from matching'
);

select * from finish();
rollback;
