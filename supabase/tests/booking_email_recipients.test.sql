begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select
  ('e3000000-0000-4000-8000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'receipt-' || n || '@atu.ie',
  crypt('password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
from generate_series(1, 3) as n;

insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity,
  signup_opens_at, confirmation_at, status, allocation_mode, fee_cents, committee_auto_signup
)
values (
  'e4000000-0000-4000-8000-000000000001',
  (date_trunc('week', now() at time zone 'Europe/London')::date + 9),
  time '19:30', 120, 8,
  now() - interval '2 days', now() - interval '1 hour',
  'confirmed', 'lottery', 0, false
);

insert into public.session_signups (session_id, user_id, status, slot_number, signed_up_at)
select
  'e4000000-0000-4000-8000-000000000001',
  profile.id,
  'selected',
  1,
  now() - interval '30 minutes'
from public.profiles as profile
where profile.id::text like 'e3000000-0000-4000-8000-%';

-- The second member already has a receipt.
update public.session_signups
set confirmation_email_sent_at = now() - interval '1 hour'
where session_id = 'e4000000-0000-4000-8000-000000000001'
  and user_id = 'e3000000-0000-4000-8000-000000000002';

select is(
  (
    select count(*)
    from public.get_booking_email_recipients(
      array['e4000000-0000-4000-8000-000000000001']::uuid[]
    )
  ),
  2::bigint,
  'only members without a receipt are returned'
);

select is(
  (
    select count(*)
    from public.get_booking_email_recipients(
      array['e4000000-0000-4000-8000-000000000001']::uuid[]
    )
    where email like '%@atu.ie'
  ),
  2::bigint,
  'the addresses come from the auth account'
);

select is(
  (
    select count(*)
    from public.get_booking_email_recipients(
      array['e4000000-0000-4000-8000-000000000099']::uuid[]
    )
  ),
  0::bigint,
  'an unrelated session returns nobody'
);

select ok(
  has_function_privilege('service_role', 'public.get_booking_email_recipients(uuid[])', 'execute'),
  'the service role can read recipients'
);

select ok(
  not has_function_privilege('authenticated', 'public.get_booking_email_recipients(uuid[])', 'execute'),
  'signed-in members cannot read other members'' email addresses'
);

select * from finish();
rollback;
