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
values
  (
    '99000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'session-admin@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '99000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'session-player@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

update public.profiles
set is_committee_admin = true
where id = '99000000-0000-4000-8000-000000000001';

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
values
  (
    '99000000-0000-4000-8000-000000000011',
    date_trunc('week', now() at time zone 'Europe/London')::date + 7,
    time '18:00',
    60,
    16,
    now() - interval '3 days',
    now() + interval '1 day',
    'open'
  ),
  (
    '99000000-0000-4000-8000-000000000012',
    date_trunc('week', now() at time zone 'Europe/London')::date + 9,
    time '20:00',
    120,
    40,
    now() - interval '3 days',
    now() + interval '1 day',
    'confirmed'
  );

insert into public.session_signups (session_id, user_id, status, slot_number)
values (
  '99000000-0000-4000-8000-000000000012',
  '99000000-0000-4000-8000-000000000001',
  'selected',
  1
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_set_session_happening(uuid, boolean)',
    'execute'
  ),
  'authenticated users can invoke the admin availability RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_set_session_happening(uuid, boolean)',
    'execute'
  ),
  'anonymous users cannot invoke the admin availability RPC'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '99000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-000000000001","email":"session-admin@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_set_session_happening(
    '99000000-0000-4000-8000-000000000011',
    false
  )$$,
  'an administrator can mark an open session as not happening'
);
select is(
  (
    select status
    from public.sessions
    where id = '99000000-0000-4000-8000-000000000011'
  ),
  'cancelled',
  'the open session is marked cancelled'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '99000000-0000-4000-8000-000000000011'
  ),
  0::bigint,
  'cancelling an open session does not create signups'
);

select throws_ok(
  $$select public.request_session_signup(
    '99000000-0000-4000-8000-000000000011',
    array[]::uuid[]
  )$$,
  'P0001',
  'This session is no longer open.',
  'players cannot sign up to a session marked not happening'
);
select is(
  public.finalize_due_sessions(),
  0,
  'cancelled sessions are excluded from due-session finalization'
);

select lives_ok(
  $$select public.admin_set_session_happening(
    '99000000-0000-4000-8000-000000000012',
    false
  )$$,
  'an administrator can mark a confirmed session as not happening'
);
select is(
  (
    select status
    from public.sessions
    where id = '99000000-0000-4000-8000-000000000012'
  ),
  'cancelled',
  'the confirmed session is marked cancelled'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = '99000000-0000-4000-8000-000000000012'
      and user_id = '99000000-0000-4000-8000-000000000001'
  ),
  'selected',
  'confirmed player signup records are retained'
);
select lives_ok(
  $$select public.admin_set_session_happening(
    '99000000-0000-4000-8000-000000000012',
    true
  )$$,
  'an administrator can reopen a cancelled confirmed session'
);
select is(
  (
    select status
    from public.sessions
    where id = '99000000-0000-4000-8000-000000000012'
  ),
  'confirmed',
  'reopening restores the prior confirmed state'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = '99000000-0000-4000-8000-000000000012'
      and user_id = '99000000-0000-4000-8000-000000000001'
  ),
  'selected',
  'reopening retains the existing confirmed place'
);
select lives_ok(
  $$select public.admin_set_session_happening(
    '99000000-0000-4000-8000-000000000011',
    true
  )$$,
  'an administrator can reopen a cancelled open session'
);
select is(
  (
    select status
    from public.sessions
    where id = '99000000-0000-4000-8000-000000000011'
  ),
  'open',
  'reopening restores the prior open state'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '99000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-000000000002","email":"session-player@atu.ie","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.admin_set_session_happening(
    '99000000-0000-4000-8000-000000000011',
    false
  )$$,
  '42501',
  'Only a club administrator can change session availability.',
  'non-admin committee members cannot change session availability'
);
reset role;

select * from finish();
rollback;
