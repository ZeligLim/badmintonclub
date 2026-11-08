begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

-- Five members with identical attendance history, so freshness cannot settle
-- the draw and only level (then signup time) can.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  ('f1000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'level-' || n || '@atu.ie',
  crypt('password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
from generate_series(1, 5) as n;

update public.profiles
set last_played_at = '2026-01-01T00:00:00Z',
    display_name = 'Level ' || right(id::text, 1)
where id::text like 'f1000000-0000-4000-8000-%';

update public.profiles set player_level = 'BEGINNER'
where id in (
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000004'
);
update public.profiles set player_level = 'INTERMEDIATE'
where id = 'f1000000-0000-4000-8000-000000000003';
update public.profiles set player_level = 'PROFESSIONAL'
where id in (
  'f1000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000005'
);

insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity,
  signup_opens_at, confirmation_at, status, allocation_mode, fee_cents, committee_auto_signup
)
values (
  'f2000000-0000-4000-8000-000000000001',
  (date_trunc('week', now() at time zone 'Europe/London')::date + 9),
  time '19:00', 60, 4, now() - interval '2 days', now() - interval '1 hour',
  'open', 'lottery', 0, false
);

-- Signup order deliberately puts the beginners first, so the old draw (signup
-- time only) would select both beginners and one professional.
insert into public.session_signups (session_id, user_id, status, signed_up_at)
values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'requested', now() - interval '90 minutes'),
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'requested', now() - interval '80 minutes'),
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', 'requested', now() - interval '70 minutes'),
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004', 'requested', now() - interval '60 minutes'),
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000005', 'requested', now() - interval '50 minutes');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","email":"level-1@atu.ie","role":"authenticated"}',
  true
);
select is(
  (select public.finalize_due_sessions()),
  1,
  'the due session is finalized'
);
reset role;

select is(
  (
    select array_agg(user_id order by user_id)
    from public.session_signups
    where session_id = 'f2000000-0000-4000-8000-000000000001'
      and status = 'selected'
  ),
  array[
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000005'
  ]::uuid[],
  'level settles an otherwise tied draw: both professionals and the intermediate get in'
);

select is(
  (
    select status
    from public.session_signups
    where session_id = 'f2000000-0000-4000-8000-000000000001'
      and user_id = 'f1000000-0000-4000-8000-000000000004'
  ),
  'waitlisted',
  'the earlier beginner loses a place to the later professional'
);

select * from finish();
rollback;
