create or replace function public.finalize_due_sessions()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_claim_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  v_session public.sessions%rowtype;
  v_finalized_count integer := 0;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or split_part(v_claim_email, '@', 2) <> 'atu.ie' then
    raise exception using
      errcode = '28000',
      message = 'Only @atu.ie email addresses can finalize sessions.';
  end if;

  for v_session in
    select *
    from public.sessions
    where status = 'open'
      and confirmation_at <= now()
      and event_date > (now() at time zone 'Europe/London')::date
    order by confirmation_at, event_date
    for update skip locked
  loop
    with ranked_signups as (
      select
        signup.session_id,
        signup.user_id,
        row_number() over (
          order by profile.last_played_at asc nulls first,
            signup.signed_up_at asc,
            signup.user_id asc
        ) as priority
      from public.session_signups as signup
      join public.profiles as profile on profile.id = signup.user_id
      where signup.session_id = v_session.id
        and signup.status = 'requested'
    )
    update public.session_signups as signup
    set
      status = case
        when ranked.priority <= v_session.capacity then 'selected'
        else 'waitlisted'
      end,
      slot_number = case
        when ranked.priority <= v_session.capacity
          then ((ranked.priority - 1) / 4 + 1)::smallint
        else null
      end
    from ranked_signups as ranked
    where signup.session_id = ranked.session_id
      and signup.user_id = ranked.user_id;

    update public.profiles as profile
    set last_played_at = greatest(
      coalesce(profile.last_played_at, '-infinity'::timestamptz),
      (v_session.event_date + v_session.starts_at) at time zone 'Europe/London'
    )
    from public.session_signups as signup
    where signup.session_id = v_session.id
      and signup.user_id = profile.id
      and signup.status = 'selected';

    update public.sessions
    set status = 'confirmed'
    where id = v_session.id and status = 'open';

    v_finalized_count := v_finalized_count + 1;
  end loop;

  return v_finalized_count;
end;
$$;
