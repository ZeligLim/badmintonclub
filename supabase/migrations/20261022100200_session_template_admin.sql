-- Committee administration of the recurring session templates.
--
-- Every function below verifies that the caller is a club administrator before
-- it changes anything, in the same way as the other admin functions.

create or replace function public.admin_list_session_templates()
returns table (
  id uuid,
  name text,
  weekday smallint,
  starts_at time,
  duration_minutes smallint,
  capacity smallint,
  fee_cents integer,
  allocation_mode text,
  committee_auto_signup boolean,
  signup_opens_lead_days smallint,
  signup_opens_at time,
  confirmation_lead_days smallint,
  confirmation_at time,
  is_active boolean,
  valid_from date,
  valid_until date,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
begin
  select email into v_admin_email
  from auth.users
  where auth.users.id = v_admin_id;

  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1
      from public.profiles
      where public.profiles.id = v_admin_id and is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can manage session templates.';
  end if;

  return query
  select
    template.id,
    template.name,
    template.weekday,
    template.starts_at,
    template.duration_minutes,
    template.capacity,
    template.fee_cents,
    template.allocation_mode,
    template.committee_auto_signup,
    template.signup_opens_lead_days,
    template.signup_opens_at,
    template.confirmation_lead_days,
    template.confirmation_at,
    template.is_active,
    template.valid_from,
    template.valid_until,
    template.created_at,
    template.updated_at
  from public.session_templates as template
  order by template.weekday, template.name;
end;
$$;

revoke all on function public.admin_list_session_templates() from public, anon, authenticated;
grant execute on function public.admin_list_session_templates() to authenticated;

create or replace function public.admin_upsert_session_template(
  p_template_id uuid,
  p_name text,
  p_weekday integer,
  p_starts_at time,
  p_duration_minutes integer,
  p_capacity integer,
  p_fee_cents integer,
  p_allocation_mode text,
  p_committee_auto_signup boolean,
  p_signup_opens_lead_days integer,
  p_signup_opens_at time,
  p_confirmation_lead_days integer,
  p_confirmation_at time,
  p_is_active boolean,
  p_valid_from date,
  p_valid_until date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_name text;
  v_template_id uuid;
  v_template public.session_templates%rowtype;
  v_event_date date := date_trunc('week', now() at time zone 'Europe/London')::date;
begin
  select email into v_admin_email
  from auth.users
  where auth.users.id = v_admin_id;

  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1
      from public.profiles
      where public.profiles.id = v_admin_id and is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can manage session templates.';
  end if;

  v_name := left(btrim(coalesce(p_name, '')), 80);

  if v_name = '' then
    raise exception using errcode = '22023', message = 'Give the session template a name.';
  end if;
  if p_weekday is null or p_weekday < 1 or p_weekday > 7 then
    raise exception using errcode = '22023', message = 'Choose a day of the week.';
  end if;
  if p_starts_at is null then
    raise exception using errcode = '22023', message = 'Choose a start time.';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 30 or p_duration_minutes > 360 then
    raise exception using errcode = '22023', message = 'Sessions must run for 30 to 360 minutes.';
  end if;
  if p_capacity is null or p_capacity < 4 or p_capacity > 64 or p_capacity % 4 <> 0 then
    raise exception using errcode = '22023', message = 'Capacity must be 4 to 64 players in multiples of four.';
  end if;
  if p_fee_cents is null or p_fee_cents < 0 or p_fee_cents > 10000 then
    raise exception using errcode = '22023', message = 'The fee must be between 0 and 100 euros.';
  end if;
  if p_allocation_mode is null or p_allocation_mode not in ('lottery', 'fcfs') then
    raise exception using errcode = '22023', message = 'Choose how places are allocated.';
  end if;
  if p_signup_opens_lead_days is null
    or p_signup_opens_lead_days < 0
    or p_signup_opens_lead_days > 21 then
    raise exception using errcode = '22023', message = 'Sign-ups must open between 0 and 21 days before the session.';
  end if;
  if p_confirmation_lead_days is null
    or p_confirmation_lead_days < 0
    or p_confirmation_lead_days > 21 then
    raise exception using errcode = '22023', message = 'Sign-ups must close between 0 and 21 days before the session.';
  end if;
  if p_valid_from is not null
    and p_valid_until is not null
    and p_valid_until < p_valid_from then
    raise exception using errcode = '22023', message = 'The end date must not be before the start date.';
  end if;

  if p_template_id is null then
    insert into public.session_templates (
      name,
      weekday,
      starts_at,
      duration_minutes,
      capacity,
      fee_cents,
      allocation_mode,
      committee_auto_signup,
      signup_opens_lead_days,
      signup_opens_at,
      confirmation_lead_days,
      confirmation_at,
      is_active,
      valid_from,
      valid_until
    )
    values (
      v_name,
      p_weekday,
      p_starts_at,
      p_duration_minutes,
      p_capacity,
      p_fee_cents,
      p_allocation_mode,
      coalesce(p_committee_auto_signup, true),
      p_signup_opens_lead_days,
      coalesce(p_signup_opens_at, time '00:00'),
      p_confirmation_lead_days,
      coalesce(p_confirmation_at, time '00:00'),
      coalesce(p_is_active, true),
      p_valid_from,
      p_valid_until
    )
    returning id into v_template_id;
  else
    update public.session_templates
    set name = v_name,
        weekday = p_weekday,
        starts_at = p_starts_at,
        duration_minutes = p_duration_minutes,
        capacity = p_capacity,
        fee_cents = p_fee_cents,
        allocation_mode = p_allocation_mode,
        committee_auto_signup = coalesce(p_committee_auto_signup, true),
        signup_opens_lead_days = p_signup_opens_lead_days,
        signup_opens_at = coalesce(p_signup_opens_at, time '00:00'),
        confirmation_lead_days = p_confirmation_lead_days,
        confirmation_at = coalesce(p_confirmation_at, time '00:00'),
        is_active = coalesce(p_is_active, true),
        valid_from = p_valid_from,
        valid_until = p_valid_until
    where public.session_templates.id = p_template_id
    returning id into v_template_id;

    if v_template_id is null then
      raise exception using errcode = 'P0002', message = 'The session template was not found.';
    end if;
  end if;

  select * into v_template
  from public.session_templates
  where id = v_template_id;

  -- The signup window has to open before it closes.
  if private.template_signup_opens_at(v_template, v_event_date + (v_template.weekday - 1))
    >= private.template_confirmation_at(v_template, v_event_date + (v_template.weekday - 1)) then
    raise exception using
      errcode = '22023',
      message = 'Sign-ups must open before they close for this template.';
  end if;

  return v_template_id;
end;
$$;

revoke all on function public.admin_upsert_session_template(
  uuid, text, integer, time, integer, integer, integer, text, boolean,
  integer, time, integer, time, boolean, date, date
) from public, anon, authenticated;
grant execute on function public.admin_upsert_session_template(
  uuid, text, integer, time, integer, integer, integer, text, boolean,
  integer, time, integer, time, boolean, date, date
) to authenticated;

create or replace function public.admin_set_session_template_active(
  p_template_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
begin
  select email into v_admin_email
  from auth.users
  where auth.users.id = v_admin_id;

  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1
      from public.profiles
      where public.profiles.id = v_admin_id and is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can manage session templates.';
  end if;

  if p_template_id is null or p_is_active is null then
    raise exception using errcode = '22023', message = 'Choose a session template.';
  end if;

  update public.session_templates
  set is_active = p_is_active
  where public.session_templates.id = p_template_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'The session template was not found.';
  end if;
end;
$$;

revoke all on function public.admin_set_session_template_active(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_session_template_active(uuid, boolean) to authenticated;

-- Brings the unpublished sessions in line with the templates.
--
-- Sessions whose sign-ups have already opened, that already have sign-ups, or
-- that are no longer open are left exactly as they are, so published sessions
-- and their bookings are never changed by a template edit.
create or replace function public.admin_publish_scheduled_sessions()
returns table (
  created_count integer,
  updated_count integer,
  removed_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_session record;
  v_template public.session_templates%rowtype;
  v_target_date date;
  v_created integer := 0;
  v_updated integer := 0;
  v_removed integer := 0;
begin
  select email into v_admin_email
  from auth.users
  where auth.users.id = v_admin_id;

  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1
      from public.profiles
      where public.profiles.id = v_admin_id and is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can manage session templates.';
  end if;

  v_created := public.ensure_scheduled_sessions(1);

  for v_session in
    select
      session.id,
      session.event_date,
      session.template_id
    from public.sessions as session
    where session.status = 'open'
      and session.signup_opens_at > now()
      and session.event_date >= (now() at time zone 'Europe/London')::date
      and not exists (
        select 1
        from public.session_signups as signup
        where signup.session_id = session.id
          and signup.status <> 'cancelled'
      )
    for update
  loop
    if v_session.template_id is null then
      continue;
    end if;

    select * into v_template
    from public.session_templates
    where id = v_session.template_id;

    if not found then
      continue;
    end if;

    if not v_template.is_active then
      delete from public.sessions
      where id = v_session.id;
      v_removed := v_removed + 1;
      continue;
    end if;

    v_target_date := date_trunc('week', v_session.event_date::timestamp)::date
      + (v_template.weekday - 1);

    if v_target_date <> v_session.event_date
      and exists (
        select 1 from public.sessions as session
        where session.event_date = v_target_date
      ) then
      -- Another session already runs that day, so this one keeps its date.
      v_target_date := v_session.event_date;
    end if;

    update public.sessions
    set event_date = v_target_date,
        starts_at = v_template.starts_at,
        duration_minutes = v_template.duration_minutes,
        capacity = v_template.capacity,
        fee_cents = v_template.fee_cents,
        allocation_mode = v_template.allocation_mode,
        committee_auto_signup = v_template.committee_auto_signup,
        signup_opens_at = private.template_signup_opens_at(v_template, v_target_date),
        confirmation_at = private.template_confirmation_at(v_template, v_target_date),
        template_id = v_template.id
    where id = v_session.id;

    v_updated := v_updated + 1;
  end loop;

  return query select v_created, v_updated, v_removed;
end;
$$;

revoke all on function public.admin_publish_scheduled_sessions() from public, anon, authenticated;
grant execute on function public.admin_publish_scheduled_sessions() to authenticated;
