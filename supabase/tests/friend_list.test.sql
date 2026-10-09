begin;

select plan(11);

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
    '90000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'friend-list-owner@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Friend List Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'friend-list-member@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Friend List Member"}'::jsonb,
    now(),
    now()
  ),
  (
    '90000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'friend-list-other@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"Other Friend List Owner"}'::jsonb,
    now(),
    now()
  );

select ok(
  (select relrowsecurity from pg_class where oid = 'public.club_friend_list'::regclass),
  'the shared friend list has row-level security enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.club_friend_list', 'select'),
  'members cannot directly read friend list records'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","email":"friend-list-owner@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.add_my_friend('90000000-0000-4000-8000-000000000002')$$,
  'an authenticated member can add another club member'
);
select lives_ok(
  $$select public.add_my_friend('90000000-0000-4000-8000-000000000002')$$,
  'adding the same friend more than once is idempotent'
);
select is(
  (select count(*)::integer from public.get_my_friend_list()),
  1,
  'the list contains the added friend once'
);
select is(
  (select student_id from public.get_my_friend_list() limit 1),
  'friend-list-member',
  'friend list entries include the member student ID'
);
select throws_ok(
  $$select public.add_my_friend('90000000-0000-4000-8000-000000000001')$$,
  '22023',
  'Choose another club member as a friend.',
  'members cannot add themselves'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000003","email":"friend-list-other@atu.ie","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.get_my_friend_list()),
  0,
  'members can only see their own friend list'
);
select lives_ok(
  $$select public.remove_my_friend('90000000-0000-4000-8000-000000000002')$$,
  'removing a friend from another member list does not error'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","email":"friend-list-owner@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.remove_my_friend('90000000-0000-4000-8000-000000000002')$$,
  'members can remove friends from their own list'
);
select is(
  (select count(*)::integer from public.get_my_friend_list()),
  0,
  'the removed friend is no longer in the list'
);

select * from finish();
rollback;
