begin;

select plan(28);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'sessions', 'sessions table exists');
select has_table('public', 'session_signups', 'session signups table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sessions'::regclass),
  'sessions has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.session_signups'::regclass),
  'session signups has row-level security enabled'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'select'),
  'anonymous users cannot query private profiles'
);
select ok(
  not has_table_privilege('anon', 'public.session_signups', 'select'),
  'anonymous users cannot query signup records'
);
select ok(
  has_table_privilege('anon', 'public.sessions', 'select'),
  'anonymous users can read non-private session schedules'
);
select ok(
  has_function_privilege('anon', 'public.ensure_next_week_sessions()', 'execute'),
  'visitors can prepare public session schedules'
);
select ok(
  has_function_privilege('authenticated', 'public.ensure_next_week_sessions()', 'execute'),
  'authenticated users can prepare public session schedules'
);
select ok(
  has_function_privilege('service_role', 'public.finalize_due_sessions()', 'execute'),
  'service role can finalize due sessions'
);
select ok(
  not has_function_privilege('authenticated', 'public.finalize_due_sessions()', 'execute'),
  'authenticated users cannot finalize sessions'
);
select ok(
  not has_function_privilege('anon', 'public.finalize_due_sessions()', 'execute'),
  'anonymous users cannot finalize sessions'
);
select ok(
  has_function_privilege('authenticated', 'public.check_in_to_session(uuid)', 'execute'),
  'authenticated users can use the checked-in own-session path'
);
select is(
  public.hook_restrict_club_email(
    '{"user":{"email":"player@atu.ie"}}'::jsonb
  ),
  '{}'::jsonb,
  'the auth hook accepts an @atu.ie address'
);
select is(
  public.hook_restrict_club_email(
    '{"user":{"email":"player@not-atu.ie"}}'::jsonb
  ) -> 'error' ->> 'message',
  'Only @atu.ie email addresses are allowed.',
  'the auth hook rejects addresses outside @atu.ie'
);
select throws_ok(
  $$
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
    ) values (
      '10000000-0000-4000-8000-000000000099',
      'authenticated',
      'authenticated',
      'outsider@example.test',
      '',
      now(),
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
  $$,
  '42501',
  'Only @atu.ie email addresses are allowed.',
  'the profile trigger also rejects non-club accounts'
);

set local role anon;
select lives_ok(
  'select public.ensure_next_week_sessions()',
  'a visitor can prepare the public Monday and Wednesday schedules'
);
reset role;

select is(
  (select confirmation_at
   from public.sessions
   where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7),
  ((date_trunc('week', now() at time zone 'Europe/London')::date + 6)::timestamp
    at time zone 'Europe/London'),
  'Monday sign-ups close at midnight on Sunday'
);
select is(
  (select confirmation_at
   from public.sessions
   where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 9),
  ((date_trunc('week', now() at time zone 'Europe/London')::date + 8)::timestamp
    at time zone 'Europe/London'),
  'Wednesday sign-ups close at midnight on Tuesday'
);

with generated_players as (
  select
    ('10000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid as id,
    player_number
  from generate_series(1, 18) as player(player_number)
)
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
  id,
  'authenticated',
  'authenticated',
  format('rally-test-%s@atu.ie', player_number),
  '',
  now(),
  '{}'::jsonb,
  jsonb_build_object('display_name', format('Player %s', player_number)),
  now(),
  now()
from generated_players;

select is(
  (select count(*) from public.profiles where id::text like '10000000-0000-4000-8000-%'),
  18::bigint,
  'auth sign-up creates a profile for every player'
);

update public.profiles
set last_played_at = '2010-01-01 00:00:00+00'::timestamptz
  + (right(id::text, 12)::integer - 2) * interval '1 day'
where right(id::text, 12)::integer > 1
  and id::text like '10000000-0000-4000-8000-%';

update public.sessions
set
  signup_opens_at = now() - interval '1 day',
  confirmation_at = now() - interval '1 minute'
where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7;

insert into public.session_signups (session_id, user_id, status)
select session.id, auth_user.id, 'requested'
from public.sessions as session
cross join auth.users as auth_user
where session.event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7
  and auth_user.id::text like '10000000-0000-4000-8000-%';

select lives_ok(
  'select public.finalize_due_sessions()',
  'due sessions can be finalized'
);

select is(
  (
    select count(*)
    from public.session_signups as signup
    join public.sessions as session on session.id = signup.session_id
    where session.event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7
      and signup.status = 'selected'
  ),
  16::bigint,
  'selection never exceeds the session capacity'
);
select is(
  (
    select count(*)
    from public.session_signups as signup
    join public.sessions as session on session.id = signup.session_id
    where session.event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7
      and signup.status = 'waitlisted'
  ),
  2::bigint,
  'players over capacity are waitlisted'
);
select is(
  (
    select signup.slot_number
    from public.session_signups as signup
    join public.sessions as session on session.id = signup.session_id
    where session.event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7
      and signup.user_id = '10000000-0000-4000-8000-000000000001'
  ),
  1::smallint,
  'a player with no previous check-in is selected first'
);
select is(
  (
    select signup.slot_number
    from public.session_signups as signup
    join public.sessions as session on session.id = signup.session_id
    where session.event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7
      and signup.user_id = '10000000-0000-4000-8000-000000000016'
  ),
  4::smallint,
  'the sixteenth-oldest player is assigned to the final slot'
);
select is(
  (
    select signup.status
    from public.session_signups as signup
    join public.sessions as session on session.id = signup.session_id
    where session.event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7
      and signup.user_id = '10000000-0000-4000-8000-000000000017'
  ),
  'waitlisted',
  'the more recently played player is lower in selection priority'
);

select * from finish();
rollback;
