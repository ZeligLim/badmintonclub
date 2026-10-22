begin;

select no_plan();

-- A committee administrator, a regular member and a committee member.
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
    'a1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'template-admin@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'template-player@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'template-committee@atu.ie',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

update public.profiles
set is_committee_admin = true
where id = 'a1000000-0000-4000-8000-000000000001';

update public.profiles
set is_committee = true
where id = 'a1000000-0000-4000-8000-000000000003';

-- Only a committee administrator may manage the templates.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","email":"template-player@atu.ie","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.admin_list_session_templates()$$,
  '42501',
  null,
  'a regular member cannot list the session templates'
);
select throws_ok(
  $$select public.admin_upsert_session_template(
    null,
    'Sneaky Tuesday',
    2,
    time '19:00',
    90,
    12,
    0,
    'lottery',
    true,
    4,
    time '00:00',
    1,
    time '00:00',
    true,
    null,
    null
  )$$,
  '42501',
  null,
  'a regular member cannot create a session template'
);
select throws_ok(
  $$select public.admin_set_session_template_active(
    'a1000000-0000-4000-8000-000000000001',
    false
  )$$,
  '42501',
  null,
  'a regular member cannot pause a session template'
);
reset role;

-- The administrator creates a template for a session that does not exist yet.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","email":"template-admin@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_upsert_session_template(
    null,
    'Test Tuesday',
    2,
    time '19:00',
    90,
    12,
    150,
    'fcfs',
    false,
    3,
    time '00:00',
    1,
    time '00:00',
    true,
    date_trunc('week', now() at time zone 'Europe/London')::date + 8,
    date_trunc('week', now() at time zone 'Europe/London')::date + 8
  )$$,
  'an administrator can create a session template'
);
reset role;

select is(
  (
    select count(*)
    from public.session_templates
    where name = 'Test Tuesday'
  ),
  1::bigint,
  'the new template is stored'
);

select is(
  (
    select count(*)
    from public.admin_list_session_templates()
    where name = 'Test Tuesday'
  ),
  1::bigint,
  'the administrator can list the new template'
);

-- Invalid templates are rejected.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","email":"template-admin@atu.ie","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.admin_upsert_session_template(
    null,
    'Bad capacity',
    2,
    time '19:00',
    90,
    10,
    0,
    'lottery',
    true,
    4,
    time '00:00',
    1,
    time '00:00',
    true,
    null,
    null
  )$$,
  '22023',
  null,
  'a capacity that is not a multiple of four is rejected'
);
select throws_ok(
  $$select public.admin_upsert_session_template(
    null,
    'Bad window',
    2,
    time '19:00',
    90,
    12,
    0,
    'lottery',
    true,
    0,
    time '00:00',
    0,
    time '00:00',
    true,
    null,
    null
  )$$,
  '22023',
  null,
  'a template whose sign-ups close before they open is rejected'
);
select throws_ok(
  $$select public.admin_upsert_session_template(
    null,
    'Bad fee',
    2,
    time '19:00',
    90,
    12,
    20000,
    'lottery',
    true,
    4,
    time '00:00',
    1,
    time '00:00',
    true,
    null,
    null
  )$$,
  '22023',
  null,
  'an unreasonable fee is rejected'
);
reset role;

-- Sessions are created from the templates.
select lives_ok(
  $$select public.ensure_scheduled_sessions(1)$$,
  'sessions are generated from the templates'
);

select is(
  (
    select starts_at::text
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  '19:00:00',
  'the generated session starts at the time of the template'
);
select is(
  (
    select duration_minutes
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  90::smallint,
  'the generated session runs for the length of the template'
);
select is(
  (
    select capacity
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  12::smallint,
  'the generated session holds the capacity of the template'
);
select is(
  (
    select fee_cents
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  150,
  'the generated session keeps the fee of the template'
);
select is(
  (
    select allocation_mode
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  'fcfs',
  'the generated session keeps the allocation mode of the template'
);
select is(
  (
    select committee_auto_signup
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  false,
  'the generated session keeps the committee rule of the template'
);
select is(
  (
    select template_id
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  (
    select id
    from public.session_templates
    where name = 'Test Tuesday'
  ),
  'the generated session records the template it came from'
);
select is(
  (
    select signup_opens_at
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  (
    (date_trunc('week', now() at time zone 'Europe/London')::date + 8 - 3)::timestamp
    at time zone 'Europe/London'
  ),
  'sign-ups open the configured number of days before the session'
);
select is(
  (
    select confirmation_at
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  (
    (date_trunc('week', now() at time zone 'Europe/London')::date + 8 - 1)::timestamp
    at time zone 'Europe/London'
  ),
  'sign-ups close the configured number of days before the session'
);

-- The club's own schedule is described by the seeded templates.
select is(
  (
    select count(*)
    from public.sessions
    where template_id is not null
      and event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7
  ),
  1::bigint,
  'the seeded Monday template produces the Monday session'
);
select is(
  (
    select starts_at::text
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 7
      and extract(isodow from event_date) = 1
  ),
  '18:00:00',
  'the Monday session keeps the club start time'
);
select is(
  (
    select allocation_mode
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 11
  ),
  'fcfs',
  'the Friday session is allocated in signup order'
);
select is(
  (
    select fee_cents
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 11
  ),
  300,
  'the Friday session keeps the club fee'
);

-- Editing a template leaves the sessions that are already published alone.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","email":"template-admin@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_upsert_session_template(
    (
      select id
      from public.session_templates
      where name = 'Test Tuesday'
    ),
    'Test Tuesday',
    2,
    time '20:00',
    120,
    16,
    0,
    'lottery',
    true,
    4,
    time '00:00',
    1,
    time '00:00',
    true,
    date_trunc('week', now() at time zone 'Europe/London')::date + 8,
    date_trunc('week', now() at time zone 'Europe/London')::date + 8
  )$$,
  'an administrator can edit a session template'
);
reset role;

select is(
  (
    select starts_at::text
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  '19:00:00',
  'a published session keeps the start time it was created with'
);
select is(
  (
    select capacity
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  12::smallint,
  'a published session keeps the capacity it was created with'
);

-- A session whose sign-ups have already opened is never changed.
insert into public.sessions (
  id,
  event_date,
  starts_at,
  duration_minutes,
  capacity,
  signup_opens_at,
  confirmation_at,
  status,
  template_id,
  allocation_mode,
  fee_cents,
  committee_auto_signup
)
values (
  'a1000000-0000-4000-8000-0000000000aa',
  date_trunc('week', now() at time zone 'Europe/London')::date + 15,
  time '09:00',
  60,
  8,
  now() - interval '1 day',
  now() + interval '2 days',
  'open',
  (
    select id
    from public.session_templates
    where name = 'Test Tuesday'
  ),
  'lottery',
  0,
  true
);

insert into public.session_signups (session_id, user_id, status)
values (
  'a1000000-0000-4000-8000-0000000000aa',
  'a1000000-0000-4000-8000-000000000002',
  'requested'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","email":"template-admin@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_publish_scheduled_sessions()$$,
  'an administrator can publish the sessions'
);
reset role;

select is(
  (
    select starts_at::text
    from public.sessions
    where id = 'a1000000-0000-4000-8000-0000000000aa'
  ),
  '09:00:00',
  'a session whose sign-ups have opened keeps its start time'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = 'a1000000-0000-4000-8000-0000000000aa'
      and status = 'requested'
  ),
  1::bigint,
  'the booking of a published session is retained'
);
select is(
  (
    select starts_at::text
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  '20:00:00',
  'a session that has not been published yet follows the template'
);

-- A session that is not published yet is removed when its template is paused.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","email":"template-admin@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_set_session_template_active(
    (
      select id
      from public.session_templates
      where name = 'Test Tuesday'
    ),
    false
  )$$,
  'an administrator can pause a session template'
);
select lives_ok(
  $$select public.admin_publish_scheduled_sessions()$$,
  'the administrator can publish the sessions again'
);
reset role;

select is(
  (
    select count(*)
    from public.sessions
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  0::bigint,
  'an unpublished session is removed when its template is paused'
);
select is(
  (
    select count(*)
    from public.sessions
    where id = 'a1000000-0000-4000-8000-0000000000aa'
  ),
  1::bigint,
  'a published session is kept when its template is paused'
);

-- The places of a first-come-first-served session are handed out at once.
insert into public.sessions (
  id,
  event_date,
  starts_at,
  duration_minutes,
  capacity,
  signup_opens_at,
  confirmation_at,
  status,
  allocation_mode
)
values
  (
    'a1000000-0000-4000-8000-0000000000b1',
    date_trunc('week', now() at time zone 'Europe/London')::date + 17,
    time '18:00',
    60,
    8,
    now() - interval '1 hour',
    now() + interval '2 days',
    'open',
    'fcfs'
  ),
  (
    'a1000000-0000-4000-8000-0000000000b2',
    date_trunc('week', now() at time zone 'Europe/London')::date + 18,
    time '18:00',
    60,
    8,
    now() - interval '1 hour',
    now() + interval '2 days',
    'open',
    'lottery'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000002","email":"template-player@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.request_session_signup(
    'a1000000-0000-4000-8000-0000000000b1',
    '{}'::uuid[]
  )$$,
  'a member can sign up for a first-come-first-served session'
);
select lives_ok(
  $$select public.request_session_signup(
    'a1000000-0000-4000-8000-0000000000b2',
    '{}'::uuid[]
  )$$,
  'a member can sign up for a lottery session'
);
reset role;

select is(
  (
    select status
    from public.session_signups
    where session_id = 'a1000000-0000-4000-8000-0000000000b1'
      and user_id = 'a1000000-0000-4000-8000-000000000002'
  ),
  'selected',
  'a first-come-first-served signup is confirmed straight away'
);
select is(
  (
    select slot_number
    from public.session_signups
    where session_id = 'a1000000-0000-4000-8000-0000000000b1'
      and user_id = 'a1000000-0000-4000-8000-000000000002'
  ),
  1::smallint,
  'a first-come-first-served signup is given a court'
);
select is(
  (
    select status
    from public.session_signups
    where session_id = 'a1000000-0000-4000-8000-0000000000b2'
      and user_id = 'a1000000-0000-4000-8000-000000000002'
  ),
  'requested',
  'a lottery signup waits for the fairness draw'
);
select is(
  (
    select slot_number
    from public.session_signups
    where session_id = 'a1000000-0000-4000-8000-0000000000b2'
      and user_id = 'a1000000-0000-4000-8000-000000000002'
  ),
  null,
  'a lottery signup is not given a court before the draw'
);

-- The committee automatic signup follows the template.
update public.profiles
set committee_auto_signup = true
where id = 'a1000000-0000-4000-8000-000000000003';

insert into public.sessions (
  id,
  event_date,
  starts_at,
  duration_minutes,
  capacity,
  signup_opens_at,
  confirmation_at,
  status,
  committee_auto_signup
)
values
  (
    'a1000000-0000-4000-8000-0000000000c1',
    date_trunc('week', now() at time zone 'Europe/London')::date + 20,
    time '18:00',
    60,
    8,
    now() - interval '1 hour',
    now() + interval '2 days',
    'open',
    true
  ),
  (
    'a1000000-0000-4000-8000-0000000000c2',
    date_trunc('week', now() at time zone 'Europe/London')::date + 21,
    time '18:00',
    60,
    8,
    now() - interval '1 hour',
    now() + interval '2 days',
    'open',
    false
  );

select lives_ok(
  $$select private.auto_signup_committee_members(null, true)$$,
  'the committee automatic signup runs'
);

select is(
  (
    select count(*)
    from public.session_signups
    where session_id = 'a1000000-0000-4000-8000-0000000000c1'
      and user_id = 'a1000000-0000-4000-8000-000000000003'
      and status = 'selected'
  ),
  1::bigint,
  'a committee member is signed up for a session that runs the automatic signup'
);
select is(
  (
    select count(*)
    from public.session_signups
    where session_id = 'a1000000-0000-4000-8000-0000000000c2'
      and user_id = 'a1000000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'a committee member is left out of a session that does not run the automatic signup'
);

-- The dashboard window follows the templates.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","email":"template-admin@atu.ie","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.admin_set_session_template_active(
    (
      select id
      from public.session_templates
      where name = 'Test Tuesday'
    ),
    true
  )$$,
  'an administrator can restart a paused session template'
);
reset role;

select lives_ok(
  $$select public.ensure_scheduled_sessions(1)$$,
  'the session of the template is created again'
);

select is(
  (
    select from_date
    from public.get_dashboard_window()
  ),
  (now() at time zone 'Europe/London')::date,
  'the dashboard window starts today'
);
select ok(
  (
    select through_date
    from public.get_dashboard_window()
  ) in (
    date_trunc('week', (now() at time zone 'Europe/London')::date)::date + 6,
    date_trunc('week', (now() at time zone 'Europe/London')::date)::date + 13
  ),
  'the dashboard window ends with the club week that is on show'
);
select ok(
  (
    select next_change_at
    from public.get_dashboard_window()
  ) is not null,
  'the dashboard knows when the club week changes'
);

select is(
  (
    select day_name
    from public.get_dashboard_sessions(
      (now() at time zone 'Europe/London')::date,
      (now() at time zone 'Europe/London')::date + 30
    )
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  'Tuesday',
  'the dashboard reports the weekday of a session'
);
select is(
  (
    select allocation_mode
    from public.get_dashboard_sessions(
      (now() at time zone 'Europe/London')::date,
      (now() at time zone 'Europe/London')::date + 30
    )
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  'lottery',
  'the dashboard reports how the places of a session are allocated'
);
select is(
  (
    select fee_cents
    from public.get_dashboard_sessions(
      (now() at time zone 'Europe/London')::date,
      (now() at time zone 'Europe/London')::date + 30
    )
    where event_date = date_trunc('week', now() at time zone 'Europe/London')::date + 8
  ),
  0,
  'the dashboard reports the fee of a session'
);

select * from finish();
rollback;
