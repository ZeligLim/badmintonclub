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
  ('22000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'committee-auto-' || player_number || '@atu.ie',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from generate_series(1, 14) as player_number;

update public.profiles
set is_committee = right(id::text, 12)::integer in (1, 2, 3, 4, 5, 7, 13, 14);

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
  session.id,
  session.event_date,
  case when extract(isodow from session.event_date) = 1
    then time '18:00' else time '20:00' end,
  case when extract(isodow from session.event_date) = 1
    then 60 else 120 end,
  4,
  session.signup_opens_at,
  session.confirmation_at,
  'open'
from (
  values
    (
      '32000000-0000-4000-8000-000000000001'::uuid,
      date_trunc('week', now() at time zone 'Europe/London')::date + 7,
      now() - interval '2 days',
      now() + interval '1 day'
    ),
    (
      '32000000-0000-4000-8000-000000000002'::uuid,
      date_trunc('week', now() at time zone 'Europe/London')::date + 9,
      now() + interval '1 day',
      now() + interval '4 days'
    )
) as session(id, event_date, signup_opens_at, confirmation_at);

insert into public.session_signups (
  session_id,
  user_id,
  status,
  signed_up_at
)
values
  (
    '32000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000004',
    'requested',
    '2000-01-01 00:00:00+00'
  ),
  (
    '32000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000005',
    'cancelled',
    now()
  );

insert into public.session_signups (session_id, user_id, status)
select
  '32000000-0000-4000-8000-000000000001',
  ('22000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'requested'
from unnest(array[6, 8, 9, 10, 11, 12]) as player_number;

select is(
  (
    select count(*)
    from public.profiles
    where is_committee
      and committee_auto_signup
  ),
  0::bigint,
  'existing committee members default to automatic signup off'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000001","email":"committee-auto-1@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.set_my_committee_auto_signup(true)$$,
  'committee members can enable automatic signup'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000002'
      and user_id = '22000000-0000-4000-8000-000000000001'
      and status = 'requested'
  ),
  1::bigint,
  'enabling automatic signup immediately adds the member to every upcoming open session, even before signup opens'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000002","email":"committee-auto-2@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.set_my_committee_auto_signup(false)$$,
  'committee members can leave automatic signup off'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000003","email":"committee-auto-3@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.set_my_committee_auto_signup(true)$$,
  'a second committee member can independently enable automatic signup'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000004',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000004","email":"committee-auto-4@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.set_my_committee_auto_signup(true)$$,
  'an opted-in member who already signed up manually can enable the setting'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000005',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000005","email":"committee-auto-5@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.set_my_committee_auto_signup(true)$$,
  'explicitly enabling auto-signup reactivates a cancelled signup for an upcoming open session'
);
reset role;
select is(
  (
    select status
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id = '22000000-0000-4000-8000-000000000005'
  ),
  'requested',
  'explicit opt-in restores the cancelled signup as an ordinary request'
);
select ok(
  exists (
    select 1
    from private.committee_auto_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id = '22000000-0000-4000-8000-000000000005'
  ),
  'a reactivated signup is tracked as automatic'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000005',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000005","email":"committee-auto-5@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.cancel_session_signup(
    '32000000-0000-4000-8000-000000000001'
  )$$,
  'a member can cancel again after explicitly opting in'
);
reset role;
select lives_ok(
  $$select private.auto_signup_committee_members(
    '32000000-0000-4000-8000-000000000001',
    true
  )$$,
  'routine automatic signup does not undo a cancellation made after opt-in'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id = '22000000-0000-4000-8000-000000000005'
  ),
  'cancelled',
  'a manually cancelled signup stays cancelled until the member opts in again'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000006',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000006","email":"committee-auto-6@atu.ie","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.set_my_committee_auto_signup(true)$$,
  '42501',
  null,
  'non-committee users cannot enable committee automatic signup'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000007',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000007","email":"committee-auto-7@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.set_my_committee_auto_signup(true)$$,
  'another committee member can opt in independently'
);
reset role;

update public.profiles
set is_committee = false
where id = '22000000-0000-4000-8000-000000000007';

update public.sessions
set signup_opens_at = now() - interval '1 minute'
where id = '32000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select private.auto_signup_committee_members(
    '32000000-0000-4000-8000-000000000002',
    false
  )$$,
  'eligible opted-in committee members are added when a session signup window opens'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000002'
      and user_id = '22000000-0000-4000-8000-000000000001'
      and status = 'requested'
  ),
  1::bigint,
  'an opted-in committee member is added once when the signup window opens'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000002'
      and user_id = '22000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'a committee member with auto-signup off is not added'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000002'
      and user_id = '22000000-0000-4000-8000-000000000007'
      and status <> 'cancelled'
  ),
  0::bigint,
  'a member who loses committee status has no active automatic signup'
);

select is(
  (
    select count(*)
    from public.session_friend_preferences
    where session_id = '32000000-0000-4000-8000-000000000002'
      and user_id = '22000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'automatic signup does not create friend preferences'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000014',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000014","email":"committee-auto-14@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.set_my_committee_auto_signup(true)$$,
  'an opted-in committee member is automatically added to the open session'
);
select lives_ok(
  $$select public.cancel_session_signup(
    '32000000-0000-4000-8000-000000000002'
  )$$,
  'a committee member can cancel an automatic signup'
);
reset role;
select lives_ok(
  $$select private.auto_signup_committee_members(
    '32000000-0000-4000-8000-000000000002',
    true
  )$$,
  'routine automatic signup processing leaves a manually cancelled signup alone'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000002'
      and user_id = '22000000-0000-4000-8000-000000000014'
  ),
  'cancelled',
  'a cancellation is not immediately reversed while auto-signup remains enabled'
);
set local role authenticated;
select lives_ok(
  $$select public.request_session_signup(
    '32000000-0000-4000-8000-000000000002',
    '{}'::uuid[]
  )$$,
  'a member can manually rejoin after cancelling an automatic signup'
);
reset role;

update public.profiles
set is_committee = false
where id = '22000000-0000-4000-8000-000000000014';

select is(
  (
    select status
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000002'
      and user_id = '22000000-0000-4000-8000-000000000014'
  ),
  'requested',
  'committee removal does not cancel a manually renewed signup'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id in (
        '22000000-0000-4000-8000-000000000004',
        '22000000-0000-4000-8000-000000000005'
      )
      and (
        (user_id = '22000000-0000-4000-8000-000000000004' and status = 'requested')
        or (user_id = '22000000-0000-4000-8000-000000000005' and status = 'cancelled')
      )
  ),
  2::bigint,
  'manual signups and cancellations after explicit opt-in are retained'
);

select is(
  (
    select signed_up_at
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id = '22000000-0000-4000-8000-000000000004'
  ),
  '2000-01-01 00:00:00+00'::timestamptz,
  'an existing manual signup is not replaced or duplicated'
);

select is(
  (
    select count(*)
    from public.profiles
    where id in (
      '22000000-0000-4000-8000-000000000001',
      '22000000-0000-4000-8000-000000000003'
    )
      and committee_auto_signup
  ),
  2::bigint,
  'each committee member retains an independent persisted setting'
);

select is(
  (
    select committee_auto_signup
    from public.profiles
    where id = '22000000-0000-4000-8000-000000000002'
  ),
  false,
  'committee auto-signup is off by default and remains off when opted out'
);

update public.sessions
set confirmation_at = now() - interval '1 minute'
where id = '32000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000013',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000013","email":"committee-auto-13@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.set_my_committee_auto_signup(true)$$,
  'a committee member can enable auto-signup after the session signup window closes'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000013',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000013","email":"committee-auto-13@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.ensure_next_week_sessions()$$,
  'loading the sessions page auto-signs up opted-in members before finalization'
);
reset role;

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id = '22000000-0000-4000-8000-000000000001'
      and status = 'requested'
  ),
  1::bigint,
  'page-load auto-signup includes the upcoming session after its signup cutoff'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id = '22000000-0000-4000-8000-000000000013'
  ),
  1::bigint,
  'an opted-in member is added to an upcoming session even after signup closes'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-4000-8000-000000000012',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000012","email":"committee-auto-12@atu.ie","role":"authenticated"}',
  true
);
select is(
  public.finalize_due_sessions(),
  1,
  'due sessions finalize successfully with automatic signup requests'
);
reset role;

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and status = 'selected'
  ),
  4::bigint,
  'automatic signups participate in matching without exceeding capacity'
);

select is(
  (
    select count(*)
    from public.session_signups as signup
    join public.profiles as profile on profile.id = signup.user_id
    where signup.session_id = '32000000-0000-4000-8000-000000000001'
      and signup.status = 'selected'
      and profile.is_committee
  ),
  4::bigint,
  'committee priority remains intact for automatically signed-up members'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id in (
        '22000000-0000-4000-8000-000000000001',
        '22000000-0000-4000-8000-000000000003',
        '22000000-0000-4000-8000-000000000004',
        '22000000-0000-4000-8000-000000000013'
      )
      and status = 'selected'
  ),
  4::bigint,
  'the finalizer enrolls a late opted-in committee member before selecting committee members first'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and status = 'selected'
      and slot_number = 1
  ),
  4::bigint,
  'the capacity selected from this session forms one complete four-player court'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id = '22000000-0000-4000-8000-000000000005'
      and status = 'cancelled'
  ),
  1::bigint,
  'finalization does not re-add a manually cancelled opted-in member'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '32000000-0000-4000-8000-000000000001'
      and user_id = '22000000-0000-4000-8000-000000000007'
      and status = 'cancelled'
  ),
  1::bigint,
  'committee removal cancels only the pending automatic signup'
);

select * from finish();
rollback;
