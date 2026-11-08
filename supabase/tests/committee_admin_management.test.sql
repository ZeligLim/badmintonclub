begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e5000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-one@atu.ie', crypt('password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-two@atu.ie', crypt('password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@atu.ie', crypt('password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set is_committee = true, is_committee_admin = true
where id = 'e5000000-0000-4000-8000-000000000001';

select is(
  (
    select count(*) from public.profiles
    where id = 'e5000000-0000-4000-8000-000000000001' and is_committee_admin
  ),
  1::bigint,
  'the fixture admin has administrator access'
);

-- A plain member cannot grant themselves administrator access.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.admin_set_committee_admin('e5000000-0000-4000-8000-000000000003', true) $$,
  '42501',
  'Only a club administrator can change administrator access.',
  'a plain member cannot grant administrator access'
);
reset role;

-- The admin can promote a second administrator.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.admin_set_committee_admin('e5000000-0000-4000-8000-000000000002', true) $$,
  'an administrator can promote another member'
);
reset role;

select is(
  (
    select count(*) from public.profiles where is_committee_admin
  ),
  2::bigint,
  'both administrators are recorded'
);

-- The last administrator cannot be removed, but either of two can.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.admin_set_committee_admin('e5000000-0000-4000-8000-000000000002', false) $$,
  'one of two administrators can be removed'
);
select throws_ok(
  $$ select public.admin_set_committee_admin('e5000000-0000-4000-8000-000000000001', false) $$,
  '22023',
  'There must always be at least one committee administrator.',
  'the last administrator cannot be removed'
);
reset role;

select is(
  (
    select count(*) from public.admin_audit_log
  ),
  2::bigint,
  'both changes were audited'
);

select * from finish();
rollback;
