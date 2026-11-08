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
  ('24000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'committee-promotion-' || player_number || '@atu.ie',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from generate_series(1, 7) as player_number;

update public.profiles
set is_committee_admin = true
where id = '24000000-0000-4000-8000-000000000001';

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
    '34000000-0000-4000-8000-000000000001',
    date_trunc('week', now() at time zone 'Europe/London')::date + 7,
    time '18:00',
    60,
    4,
    now() - interval '2 days',
    now() + interval '1 day',
    'open'
  ),
  (
    '34000000-0000-4000-8000-000000000002',
    date_trunc('week', now() at time zone 'Europe/London')::date + 9,
    time '20:00',
    120,
    4,
    now() - interval '2 days',
    now() + interval '1 day',
    'open'
  );

insert into public.session_signups (session_id, user_id, status, slot_number)
select
  '34000000-0000-4000-8000-000000000002',
  ('24000000-0000-4000-8000-' || lpad(player_number::text, 12, '0'))::uuid,
  'selected',
  1
from generate_series(3, 6) as player_number;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '24000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"24000000-0000-4000-8000-000000000002","email":"committee-promotion-2@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '34000000-0000-4000-8000-000000000001',
    '{}'::uuid[]
  )$$,
  'a regular member can manually request an open session'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = '34000000-0000-4000-8000-000000000001'
      and user_id = '24000000-0000-4000-8000-000000000002'
  ),
  'requested',
  'the initial manual signup is pending before committee promotion'
);
select is(
  (
    select current_user_status
    from public.get_dashboard_sessions(
      date_trunc('week', now() at time zone 'Europe/London')::date + 7,
      date_trunc('week', now() at time zone 'Europe/London')::date + 7
    )
    where id = '34000000-0000-4000-8000-000000000001'
  ),
  'requested',
  'the dashboard fetch returns the persisted pending status before promotion'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '24000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"24000000-0000-4000-8000-000000000001","email":"committee-promotion-1@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_set_committee_status(
    '24000000-0000-4000-8000-000000000002',
    true
  )$$,
  'an administrator can promote the member to committee'
);
reset role;
select is(
  (
    select status
    from public.session_signups
    where session_id = '34000000-0000-4000-8000-000000000001'
      and user_id = '24000000-0000-4000-8000-000000000002'
  ),
  'selected',
  'promoting a member confirms their existing manual request when capacity is available'
);
select is(
  (
    select slot_number
    from public.session_signups
    where session_id = '34000000-0000-4000-8000-000000000001'
      and user_id = '24000000-0000-4000-8000-000000000002'
  ),
  1::smallint,
  'the promoted member receives an available slot'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '24000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"24000000-0000-4000-8000-000000000002","email":"committee-promotion-2@atu.ie","role":"authenticated"}',
  true
);
select is(
  (
    select current_user_status
    from public.get_dashboard_sessions(
      date_trunc('week', now() at time zone 'Europe/London')::date + 7,
      date_trunc('week', now() at time zone 'Europe/London')::date + 7
    )
    where id = '34000000-0000-4000-8000-000000000001'
  ),
  'selected',
  'a fresh dashboard fetch returns the persisted confirmed status'
);
select throws_ok(
  $$select public.request_session_signup(
    '34000000-0000-4000-8000-000000000001',
    '{}'::uuid[]
  )$$,
  'P0001',
  'You already have a place or waitlist request.',
  'a repeated join does not overwrite the existing signup'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '34000000-0000-4000-8000-000000000001'
      and user_id = '24000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'repeated join requests cannot create duplicate signup records'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '24000000-0000-4000-8000-000000000007',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"24000000-0000-4000-8000-000000000007","email":"committee-promotion-7@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    '34000000-0000-4000-8000-000000000002',
    '{}'::uuid[]
  )$$,
  'a regular member can request a place in a full session'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '24000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"24000000-0000-4000-8000-000000000001","email":"committee-promotion-1@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_set_committee_status(
    '24000000-0000-4000-8000-000000000007',
    true
  )$$,
  'an administrator can promote a member whose requested session is full'
);
reset role;
select is(
  (
    select status
    from public.session_signups
    where session_id = '34000000-0000-4000-8000-000000000002'
      and user_id = '24000000-0000-4000-8000-000000000007'
  ),
  'waitlisted',
  'committee promotion does not confirm beyond session capacity'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '34000000-0000-4000-8000-000000000002'
      and status in ('selected', 'played')
  ),
  4::bigint,
  'promotion preserves the session capacity limit'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '24000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"24000000-0000-4000-8000-000000000002","email":"committee-promotion-2@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.cancel_session_signup(
    '34000000-0000-4000-8000-000000000001'
  )$$,
  'a committee member can cancel the confirmed signup'
);
select lives_ok(
  $$select public.request_session_signup(
    '34000000-0000-4000-8000-000000000001',
    '{}'::uuid[]
  )$$,
  'a cancelled committee signup can be rejoined manually'
);
reset role;
select is(
  (
    select status
    from public.session_signups
    where session_id = '34000000-0000-4000-8000-000000000001'
      and user_id = '24000000-0000-4000-8000-000000000002'
  ),
  'selected',
  'a manual rejoin uses the committee confirmation status'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = '34000000-0000-4000-8000-000000000001'
      and user_id = '24000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'cancellation and rejoining reuse the existing signup record'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '24000000-0000-4000-8000-000000000007',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"24000000-0000-4000-8000-000000000007","email":"committee-promotion-7@atu.ie","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.admin_set_committee_status(
    '24000000-0000-4000-8000-000000000007',
    true
  )$$,
  '42501',
  'Only a club administrator can change committee status.',
  'a member cannot grant themselves committee privileges'
);
reset role;

select * from finish();
rollback;
