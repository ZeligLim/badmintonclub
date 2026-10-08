create or replace function public.set_my_committee_auto_signup(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_reactivated_session_ids uuid[];
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to change your auto-signup setting.';
  end if;

  select email into v_email
  from auth.users
  where id = v_user_id;

  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie committee members can change this setting.';
  end if;
  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and is_committee
  ) then
    raise exception using errcode = '42501', message = 'Only committee members can change this setting.';
  end if;
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'Choose whether automatic signup is on or off.';
  end if;

  update public.profiles
  set committee_auto_signup = p_enabled
  where id = v_user_id
    and is_committee;

  if p_enabled then
    with reactivated_signups as (
      update public.session_signups as signup
      set status = 'requested',
          slot_number = null,
          signed_up_at = now()
      from public.sessions as session
      where signup.session_id = session.id
        and signup.user_id = v_user_id
        and signup.status = 'cancelled'
        and session.status = 'open'
        and ((session.event_date + session.starts_at) at time zone 'Europe/London') > now()
      returning signup.session_id
    )
    select array_agg(session_id)
    into v_reactivated_session_ids
    from reactivated_signups;

    if v_reactivated_session_ids is not null then
      insert into private.committee_auto_signups (session_id, user_id)
      select session_id, v_user_id
      from unnest(v_reactivated_session_ids) as session_id
      on conflict do nothing;
    end if;

    perform private.auto_signup_committee_members(null, true);
  end if;
end;
$$;

revoke all on function public.set_my_committee_auto_signup(boolean)
  from public, anon, authenticated;
grant execute on function public.set_my_committee_auto_signup(boolean)
  to authenticated;
