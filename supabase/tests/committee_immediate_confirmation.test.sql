begin;

select plan(10);

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
  ('23000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'committee-confirmation-' || player_number || '@atu.ie',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from generate_series(1, 7) as player_number;

update public.profiles
set is_committee = id in (
  '23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000006',
  '23000000-0000-4000-8000-000000000007'
);

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
values
  (
    '33000000-0000-4000-8000-000000000001',
    date_trunc('week', now() at time zone 'Europe/London')::date + 7,
    time '18:00',
    60,
    4,
    now() - interval '1 day',
    now() + interval '1 day',
    'open'
  ),
  (
    '33000000-0000-4000-8000-000000000002',
    date_trunc('week', now() at time zone 'Europe/London')::date + 14,
    time '18:00',
    60,
    4,
    now() - interval '1 day',
    now() + interval '1 day',
    'open'
  ),
  (
    '33000000-0000-4000-8000-000000000003',
    date_trunc('week', now() at time zone 'Europe/London')::date + 21,
    time '18:00',
    60,
    4,
    now() - interval '1 day',
    now() - interval '1 minute',
    'open'
  );

insert into public.session_signups (session_id, user_id, status, slot_number)
select
  '33000000-0000-4000-8000-000000000002',
  ('23000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'selected',
  1
from generate_series(2, 5) as player_number;

insert into public.session_signups (session_id, user_id, status, slot_number)
values (
  '33000000-0000-4000-8000-000000000003',
  '23000000-0000-4000-8000-000000000001',
  'selected',
  1
);

insert into public.session_signups (session_id, user_id, status)
select
  '33000000-0000-4000-8000-000000000003',
  ('23000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'requested'
from generate_series(2, 4) as player_number;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '23000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"23000000-0000-4000-8000-000000000001","email":"committee-confirmation-1@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '33000000-0000-4000-8000-000000000001',
    '{}'::uuid[]
  )$$,
  'a committee member can join an open session'
);
reset role;
select is(
  (
    select status
    from public.session_signups
    where session_id = '33000000-0000-4000-8000-000000000001'
      and user_id = '23000000-0000-4000-8000-000000000001'
  ),
  'selected',
  'a committee signup with capacity available is confirmed immediately'
);
select is(
  (
    select slot_number
    from public.session_signups
    where session_id = '33000000-0000-4000-8000-000000000001'
      and user_id = '23000000-0000-4000-8000-000000000001'
  ),
  1::smallint,
  'an immediately confirmed committee member receives an available court slot'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '23000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"23000000-0000-4000-8000-000000000002","email":"committee-confirmation-2@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '33000000-0000-4000-8000-000000000001',
    '{}'::uuid[]
  )$$,
  'a non-committee member can join the same open session'
);
reset role;
select is(
  (
    select status
    from public.session_signups
    where session_id = '33000000-0000-4000-8000-000000000001'
      and user_id = '23000000-0000-4000-8000-000000000002'
  ),
  'requested',
  'non-committee signups still await the normal confirmation process'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '23000000-0000-4000-8000-000000000006',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"23000000-0000-4000-8000-000000000006","email":"committee-confirmation-6@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '33000000-0000-4000-8000-000000000002',
    '{}'::uuid[]
  )$$,
  'a committee member can join when an open session has reached capacity'
);
reset role;
select is(
  (
    select status
    from public.session_signups
    where session_id = '33000000-0000-4000-8000-000000000002'
      and user_id = '23000000-0000-4000-8000-000000000006'
  ),
  'waitlisted',
  'a committee member is waitlisted when no confirmed place remains'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '23000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"23000000-0000-4000-8000-000000000001","email":"committee-confirmation-1@atu.ie","role":"authenticated"}',
  true
);
select is(
  public.finalize_due_sessions(),
  1,
  'the due session finalizes'
);
reset role;
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '33000000-0000-4000-8000-000000000003'
      and status = 'selected'
  ),
  4::bigint,
  'finalization accounts for the committee place already confirmed'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '33000000-0000-4000-8000-000000000003'
      and status = 'selected'
      and slot_number = 1
  ),
  4::bigint,
  'finalization places the remaining selected players in the same available court slot'
);

select * from finish();
rollback;
