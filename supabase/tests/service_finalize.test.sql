begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

-- A due session with four members waiting for a draw.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  ('e1000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'service-' || n || '@atu.ie',
  crypt('password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
from generate_series(1, 4) as n;

update public.profiles
set display_name = 'Service ' || right(id::text, 1)
where id::text like 'e1000000-0000-4000-8000-%';

insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity,
  signup_opens_at, confirmation_at, status, allocation_mode, fee_cents, committee_auto_signup
)
values (
  'e2000000-0000-4000-8000-000000000001',
  (date_trunc('week', now() at time zone 'Europe/London')::date + 9),
  time '19:30', 120, 4,
  now() - interval '2 days', now() - interval '1 hour',
  'open', 'lottery', 0, false
);

insert into public.session_signups (session_id, user_id, status, signed_up_at)
select
  'e2000000-0000-4000-8000-000000000001',
  profile.id,
  'requested',
  now() - interval '30 minutes'
from public.profiles as profile
where profile.id::text like 'e1000000-0000-4000-8000-%';

select is(
  (
    select status
    from public.sessions
    where id = 'e2000000-0000-4000-8000-000000000001'
  ),
  'open',
  'the session starts open'
);

-- The scheduled job has no user session: it authenticates with the service key,
-- which is what makes finalization independent of anybody opening the app.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select public.finalize_due_sessions_service()),
  1,
  'the service entry point finalizes a due session without a signed-in member'
);
reset role;

select is(
  (
    select status
    from public.sessions
    where id = 'e2000000-0000-4000-8000-000000000001'
  ),
  'confirmed',
  'the session is confirmed with no browser involved'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = 'e2000000-0000-4000-8000-000000000001'
      and status = 'selected'
  ),
  4::bigint,
  'every requested member got a place'
);

select * from finish();
rollback;
