create or replace function private.is_club_email(p_email text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select coalesce(p_email ~* '^[^@]+@atu[.]ie$', false);
$$;

revoke all on function private.is_club_email(text) from public, anon, authenticated;
grant usage on schema private to authenticated, supabase_auth_admin;
grant execute on function private.is_club_email(text) to authenticated, supabase_auth_admin;

create or replace function public.hook_restrict_club_email(event jsonb)
returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_email text := event #>> '{user,email}';
begin
  if v_email ~* '^[^@]+@atu[.]ie$' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Only @atu.ie email addresses are allowed.'
    )
  );
end;
$$;

revoke all on function public.hook_restrict_club_email(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.hook_restrict_club_email(jsonb)
  to supabase_auth_admin;

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_display_name text;
begin
  if not private.is_club_email(new.email) then
    raise exception using
      errcode = '42501',
      message = 'Only @atu.ie email addresses are allowed.';
  end if;

  v_display_name := nullif(
    btrim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, ''), '@', 1),
      'Player'
    )),
    ''
  );

  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(v_display_name, 'Player'), 80))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop policy "Profiles are visible to their owner" on public.profiles;
create policy "Club members can read their own profiles"
  on public.profiles for select to authenticated
  using (
    (select auth.uid()) = id
    and (select private.is_club_email((select auth.jwt()) ->> 'email'))
  );

drop policy "Users may update their own display name" on public.profiles;
create policy "Club members may update their own display name"
  on public.profiles for update to authenticated
  using (
    (select auth.uid()) = id
    and (select private.is_club_email((select auth.jwt()) ->> 'email'))
  )
  with check (
    (select auth.uid()) = id
    and (select private.is_club_email((select auth.jwt()) ->> 'email'))
  );

drop policy "Users may read their own signups" on public.session_signups;
create policy "Club members may read their own signups"
  on public.session_signups for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select private.is_club_email((select auth.jwt()) ->> 'email'))
  );

update public.session_signups as signup
set status = 'cancelled', slot_number = null
from auth.users as auth_user
where auth_user.id = signup.user_id
  and not private.is_club_email(auth_user.email)
  and signup.status not in ('cancelled', 'played');

create or replace function private.require_club_email_for_signup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if not exists (
    select 1
    from auth.users
    where id = new.user_id
      and private.is_club_email(email)
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only @atu.ie email addresses can sign up for sessions.';
  end if;

  return new;
end;
$$;

revoke all on function private.require_club_email_for_signup()
  from public, anon, authenticated;
create trigger require_club_email_for_signup
  before insert or update on public.session_signups
  for each row execute function private.require_club_email_for_signup();

create or replace function public.get_session_roster(p_session_id uuid)
returns table (
  session_id uuid,
  slot_number smallint,
  user_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
  select signup.session_id, signup.slot_number, signup.user_id, profile.display_name
  from public.session_signups as signup
  join public.profiles as profile on profile.id = signup.user_id
  join public.sessions as session on session.id = signup.session_id
  where signup.session_id = p_session_id
    and (select auth.uid()) is not null
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    and (select private.is_club_email((select auth.jwt()) ->> 'email'))
    and signup.status in ('selected', 'played')
    and session.status = 'confirmed'
    and session.event_date between (now() at time zone 'Europe/London')::date
      and (now() at time zone 'Europe/London')::date + 14
  order by signup.slot_number, signup.signed_up_at, signup.user_id;
$$;