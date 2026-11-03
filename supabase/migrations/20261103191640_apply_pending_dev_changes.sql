-- Apply the recurring signup window correction to templates that were seeded
-- by the already-applied 20261022100000 migration.
update public.session_templates
set signup_opens_lead_days = 0
where name in ('Monday evening', 'Wednesday evening')
  and signup_opens_lead_days <> 0;

-- Keep random test signups inside the session's signup window, then restore
-- the shared virtual clock even when the previous value was real time.
create or replace function public.dev_random_session_signups(p_count integer)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_session record;
  v_user record;
  v_virtual_now_before timestamptz;
begin
  if p_count is null or p_count < 1 or p_count > 100 then
    raise exception using errcode = '22023', message = 'Choose between 1 and 100 players.';
  end if;

  select virtual_now into v_virtual_now_before
  from public.dev_virtual_clock
  where id = 1;

  for v_session in
    select id, signup_opens_at, confirmation_at
    from public.sessions
    where status = 'open'
  loop
    perform public.set_virtual_now(
      v_session.signup_opens_at + (v_session.confirmation_at - v_session.signup_opens_at) / 2
    );

    for v_user in
      select u.id
      from auth.users u
      join public.profiles p on p.id = u.id
      where p.is_committee is not true
        and not exists (
          select 1
          from public.session_signups s
          where s.session_id = v_session.id
            and s.user_id = u.id
        )
      order by random()
      limit p_count
    loop
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user.id, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', v_user.id::text, true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);

      begin
        perform public.request_session_signup(v_session.id, '{}'::uuid[]);
      exception
        when others then
          null;
      end;
    end loop;
  end loop;

  if v_virtual_now_before is null then
    perform public.reset_virtual_now();
  else
    perform public.set_virtual_now(v_virtual_now_before);
  end if;
end;
$$;

revoke all on function public.dev_random_session_signups(integer) from public, anon, authenticated;
grant execute on function public.dev_random_session_signups(integer) to service_role;
