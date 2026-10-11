begin;

select plan(4);

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
values (
  '98000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'cancellation-player@atu.ie',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

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
    '98000000-0000-4000-8000-000000000011',
    date_trunc('week', now() at time zone 'Europe/London')::date + 14,
    time '18:00',
    60,
    16,
    now() - interval '3 days',
    now() - interval '1 day',
    'confirmed'
  ),
  (
    '98000000-0000-4000-8000-000000000012',
    date_trunc('week', now() at time zone 'Europe/London')::date - 7,
    time '18:00',
    60,
    16,
    now() - interval '10 days',
    now() - interval '8 days',
    'confirmed'
  );

insert into public.session_signups (session_id, user_id, status, slot_number)
values
  (
    '98000000-0000-4000-8000-000000000011',
    '98000000-0000-4000-8000-000000000001',
    'selected',
    1
  ),
  (
    '98000000-0000-4000-8000-000000000012',
    '98000000-0000-4000-8000-000000000001',
    'selected',
    1
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '98000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000001","email":"cancellation-player@atu.ie","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.cancel_session_signup('98000000-0000-4000-8000-000000000011')$$,
  'a player can cancel a confirmed place before the session starts'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = '98000000-0000-4000-8000-000000000011'
      and user_id = '98000000-0000-4000-8000-000000000001'
  ),
  'cancelled',
  'cancelling a confirmed place marks the signup cancelled'
);
select is(
  (
    select slot_number
    from public.session_signups
    where session_id = '98000000-0000-4000-8000-000000000011'
      and user_id = '98000000-0000-4000-8000-000000000001'
  ),
  null::smallint,
  'cancelling a confirmed place clears its slot'
);
select throws_ok(
  $$select public.cancel_session_signup('98000000-0000-4000-8000-000000000012')$$,
  'P0001',
  'This session can no longer be changed.',
  'a player cannot cancel after the session starts'
);

reset role;
rollback;
