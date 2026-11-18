begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- Two members and two sessions: one that has not started (cancelling is still
-- allowed) and one that started an hour ago (only a no-show marker is left).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f8000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'late-1@atu.ie', crypt('password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('f8000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'late-2@atu.ie', crypt('password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles
set display_name = 'Late ' || right(id::text, 1)
where id::text like 'f8000000-0000-4000-8000-%';

insert into public.sessions (
  id, event_date, starts_at, duration_minutes, capacity,
  signup_opens_at, confirmation_at, status, allocation_mode, fee_cents,
  committee_auto_signup
)
values
  (
    'f8100000-0000-4000-8000-000000000001',
    (date_trunc('week', now() at time zone 'Europe/London')::date + 33),
    time '19:00', 60, 8, now() - interval '2 days', now() - interval '1 hour',
    'confirmed', 'lottery', 0, false
  ),
  (
    'f8100000-0000-4000-8000-000000000002',
    (timezone('Europe/London', now()) - interval '1 hour')::date,
    (timezone('Europe/London', now()) - interval '1 hour')::time,
    60, 8, now() - interval '3 days', now() - interval '2 days',
    'confirmed', 'lottery', 0, false
  );

insert into public.session_signups (session_id, user_id, status, slot_number)
values
  ('f8100000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000001', 'selected', 1),
  ('f8100000-0000-4000-8000-000000000002', 'f8000000-0000-4000-8000-000000000001', 'selected', 1);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-4000-8000-000000000001","email":"late-1@atu.ie","role":"authenticated"}',
  true
);

-- 1. Before the first serve, cancelling still works.
select lives_ok(
  $$ select public.cancel_session_signup('f8100000-0000-4000-8000-000000000001') $$,
  'a member can cancel before the session starts'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = 'f8100000-0000-4000-8000-000000000001'
      and user_id = 'f8000000-0000-4000-8000-000000000001'
  ),
  'cancelled',
  'the cancelled place is released'
);

-- 2. After the first serve, cancelling is refused with an actionable message.
select throws_ok(
  $$ select public.cancel_session_signup('f8100000-0000-4000-8000-000000000002') $$,
  'P0001',
  'This session has already started. Mark yourself as not showing instead.',
  'cancelling is refused once the session has started'
);

-- 3. Marking a no-show is refused before the session starts.
select throws_ok(
  $$ select public.set_session_no_show('f8100000-0000-4000-8000-000000000001', true) $$,
  'P0001',
  'This session has not started yet. Cancel your place instead.',
  'a no-show cannot be declared before the session starts'
);

-- 4. Once it has started, the same member can say they are not coming.
select lives_ok(
  $$ select public.set_session_no_show('f8100000-0000-4000-8000-000000000002', true) $$,
  'a member can mark themselves as not showing after the start'
);
select isnt(
  (
    select no_show_at
    from public.session_signups
    where session_id = 'f8100000-0000-4000-8000-000000000002'
      and user_id = 'f8000000-0000-4000-8000-000000000001'
  ),
  null,
  'the no-show marker is recorded'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = 'f8100000-0000-4000-8000-000000000002'
      and user_id = 'f8000000-0000-4000-8000-000000000001'
  ),
  'selected',
  'a no-show keeps the place, so nobody else is silently promoted mid-session'
);

-- 5. The marker can be taken back.
select lives_ok(
  $$ select public.set_session_no_show('f8100000-0000-4000-8000-000000000002', false) $$,
  'a member can take the no-show marker back'
);
select is(
  (
    select no_show_at
    from public.session_signups
    where session_id = 'f8100000-0000-4000-8000-000000000002'
      and user_id = 'f8000000-0000-4000-8000-000000000001'
  ),
  null::timestamptz,
  'the marker is cleared'
);

reset role;

-- 6. Saving bumps the timetable version, which is what the change notice reads.
select is(
  public.save_session_timetable(
    'f8100000-0000-4000-8000-000000000002',
    '[]'::jsonb
  ),
  1,
  'the first save starts at version 1'
);
select is(
  public.save_session_timetable(
    'f8100000-0000-4000-8000-000000000002',
    '[]'::jsonb
  ),
  2,
  'saving again bumps the version'
);

-- 7. Acknowledging the change copies the current version onto the member.
update public.session_signups
set timetable_seen_version = 0
where session_id = 'f8100000-0000-4000-8000-000000000002'
  and user_id = 'f8000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"f8000000-0000-4000-8000-000000000001","email":"late-1@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$ select public.mark_session_timetable_seen(array['f8100000-0000-4000-8000-000000000002']::uuid[]) $$,
  'a member can acknowledge the latest timetable'
);
reset role;

select is(
  (
    select timetable_seen_version
    from public.session_signups
    where session_id = 'f8100000-0000-4000-8000-000000000002'
      and user_id = 'f8000000-0000-4000-8000-000000000001'
  ),
  2,
  'the acknowledged version is the one that was saved'
);

select * from finish();
rollback;
