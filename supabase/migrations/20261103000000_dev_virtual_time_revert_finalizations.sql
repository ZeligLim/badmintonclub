-- Dev-only: make changing the virtual clock roll back session finalizations that
-- happened after the new "now", so time travel behaves like the clock moved.
create or replace function public.revert_session_finalizations(p_cutoff timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if p_cutoff is null then
    p_cutoff := pg_catalog.now();
  end if;

  delete from public.session_timetables
  where session_id in (
    select id
    from public.sessions
    where status = 'confirmed'
      and confirmation_at > p_cutoff
  );

  update public.session_signups as signup
  set status = 'requested',
      slot_number = null
  where signup.session_id in (
    select session.id
    from public.sessions as session
    where session.status = 'confirmed'
      and session.confirmation_at > p_cutoff
  )
    and signup.status in ('selected', 'waitlisted');

  update public.sessions as session
  set status = 'open'
  where session.status = 'confirmed'
    and session.confirmation_at > p_cutoff;
end;
$$;

revoke all on function public.revert_session_finalizations(timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.set_virtual_now(p_virtual_now timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  update public.dev_virtual_clock
  set virtual_now = p_virtual_now,
      updated_at = pg_catalog.now()
  where id = 1;

  if p_virtual_now is null then
    perform public.revert_session_finalizations(pg_catalog.now());
  else
    perform public.revert_session_finalizations(p_virtual_now);
  end if;
end;
$$;

revoke all on function public.set_virtual_now(timestamptz) from public, anon, authenticated;
grant execute on function public.set_virtual_now(timestamptz) to anon, authenticated, service_role, supabase_auth_admin;

create or replace function public.reset_virtual_now()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  update public.dev_virtual_clock
  set virtual_now = null,
      updated_at = pg_catalog.now()
  where id = 1;

  perform public.revert_session_finalizations(pg_catalog.now());
end;
$$;

revoke all on function public.reset_virtual_now() from public, anon, authenticated;
grant execute on function public.reset_virtual_now() to anon, authenticated, service_role, supabase_auth_admin;