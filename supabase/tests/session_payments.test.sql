begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e8000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'treasurer@atu.ie', crypt('password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e8000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'payer@atu.ie', crypt('password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set is_committee = true, is_committee_admin = true, display_name = 'Treasurer'
where id = 'e8000000-0000-4000-8000-000000000001';

insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity, fee_cents,
  signup_opens_at, confirmation_at, status, allocation_mode, committee_auto_signup
)
values (
  'e9000000-0000-4000-8000-000000000001',
  (date_trunc('week', now() at time zone 'Europe/London')::date + 5),
  time '15:00', 120, 8, 300,
  now() - interval '2 days', now() - interval '1 hour',
  'confirmed', 'lottery', false
);

insert into public.session_signups (session_id, user_id, status, slot_number, signed_up_at)
values (
  'e9000000-0000-4000-8000-000000000001',
  'e8000000-0000-4000-8000-000000000002',
  'selected', 1, now() - interval '30 minutes'
);

select is(
  (
    select payment_status from public.session_signups
    where session_id = 'e9000000-0000-4000-8000-000000000001'
      and user_id = 'e8000000-0000-4000-8000-000000000002'
  ),
  'unpaid',
  'a new signup starts unpaid'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$ select public.admin_set_payment_status(
       'e9000000-0000-4000-8000-000000000001',
       'e8000000-0000-4000-8000-000000000002',
       'paid'
     ) $$,
  '42501',
  'Only a club administrator can record a payment.',
  'a member cannot mark their own payment'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.admin_set_payment_status(
       'e9000000-0000-4000-8000-000000000001',
       'e8000000-0000-4000-8000-000000000002',
       'paid'
     ) $$,
  'an administrator can mark a payment'
);
reset role;

select is(
  (
    select payment_status from public.session_signups
    where session_id = 'e9000000-0000-4000-8000-000000000001'
      and user_id = 'e8000000-0000-4000-8000-000000000002'
  ),
  'paid',
  'the payment is recorded'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e8000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.admin_set_payment_status(
       'e9000000-0000-4000-8000-000000000001',
       'e8000000-0000-4000-8000-000000000002',
       'refunded'
     ) $$,
  '22023',
  'Choose unpaid, paid or waived.',
  'an unknown payment state is rejected'
);
reset role;

select is(
  (
    select details ->> 'from' || '->' || (details ->> 'to')
    from public.admin_audit_log
    where action = 'set-payment'
  ),
  'unpaid->paid',
  'the change is audited with both states'
);

select * from finish();
rollback;
