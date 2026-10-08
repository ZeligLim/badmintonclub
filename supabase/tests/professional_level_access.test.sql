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
    '98000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'professional-admin@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '98000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'professional-member@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

update public.profiles
set is_committee_admin = true
where id = '98000000-0000-4000-8000-000000000001';

select has_column(
  'public',
  'profiles',
  'can_choose_professional',
  'member Professional self-selection permission is stored on profiles'
);
select is(
  (
    select can_choose_professional
    from public.profiles
    where id = '98000000-0000-4000-8000-000000000002'
  ),
  false,
  'new members do not see Professional choice by default'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_set_professional_choice(uuid, boolean)',
    'execute'
  ),
  'authenticated members can call the permission RPC subject to its admin check'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_set_professional_choice(uuid, boolean)',
    'execute'
  ),
  'anonymous users cannot call the permission RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.admin_set_committee_status(uuid, boolean)',
    'execute'
  ),
  'authenticated members can call the committee RPC subject to its admin check'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_set_committee_status(uuid, boolean)',
    'execute'
  ),
  'anonymous users cannot call the committee RPC'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '98000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000002","email":"professional-member@atu.ie","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.update_my_player_level('PROFESSIONAL')$$,
  '22023',
  'Professional level is not available for this member.',
  'members without permission cannot choose Professional'
);
select throws_ok(
  $$select public.admin_set_professional_choice(
    '98000000-0000-4000-8000-000000000002',
    true
  )$$,
  '42501',
  'Only a club administrator can change Professional level access.',
  'members cannot grant themselves Professional choice'
);
select throws_ok(
  $$select public.admin_set_committee_status(
    '98000000-0000-4000-8000-000000000002',
    true
  )$$,
  '42501',
  'Only a club administrator can change committee status.',
  'members cannot grant themselves committee status'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '98000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000001","email":"professional-admin@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_set_professional_choice(
    '98000000-0000-4000-8000-000000000002',
    true
  )$$,
  'an administrator can enable Professional choice for a member'
);
select lives_ok(
  $$select public.admin_set_committee_status(
    '98000000-0000-4000-8000-000000000002',
    true
  )$$,
  'an administrator can update committee status without changing player level'
);
reset role;
select is(
  (
    select is_committee
    from public.profiles
    where id = '98000000-0000-4000-8000-000000000002'
  ),
  true,
  'the committee status is persisted independently'
);
select is(
  (
    select player_level
    from public.profiles
    where id = '98000000-0000-4000-8000-000000000002'
  ),
  'INTERMEDIATE',
  'changing committee status does not change player level'
);
select is(
  (
    select can_choose_professional
    from public.profiles
    where id = '98000000-0000-4000-8000-000000000002'
  ),
  true,
  'the enabled permission is persisted'
);
select ok(
  exists (
    select 1
    from public.admin_list_club_players()
    where user_id = '98000000-0000-4000-8000-000000000002'
      and can_choose_professional
  ),
  'the admin member list reports Professional choice access'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '98000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000002","email":"professional-member@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.update_my_player_level('PROFESSIONAL')$$,
  'a member with permission can select Professional'
);
select is(
  (
    select player_level
    from public.profiles
    where id = '98000000-0000-4000-8000-000000000002'
  ),
  'PROFESSIONAL',
  'the member profile saves Professional level'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '98000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000001","email":"professional-admin@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_set_professional_choice(
    '98000000-0000-4000-8000-000000000002',
    false
  )$$,
  'an administrator can disable Professional choice'
);
reset role;
select is(
  (
    select can_choose_professional
    from public.profiles
    where id = '98000000-0000-4000-8000-000000000002'
  ),
  false,
  'the disabled permission is persisted'
);
select is(
  (
    select player_level
    from public.profiles
    where id = '98000000-0000-4000-8000-000000000002'
  ),
  'INTERMEDIATE',
  'disabling Professional choice safely resets an existing Professional level'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '98000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"98000000-0000-4000-8000-000000000002","email":"professional-member@atu.ie","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.update_my_player_level('PROFESSIONAL')$$,
  '22023',
  'Professional level is not available for this member.',
  'a member cannot choose Professional after access is disabled'
);
reset role;

select * from finish();
rollback;
