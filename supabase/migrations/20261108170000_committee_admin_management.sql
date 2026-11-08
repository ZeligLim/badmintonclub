-- BC-15: `is_committee_admin` could only be set by hand-written SQL, but only an
-- admin can grant access, so replacing the last admin needed database access.
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Administrative changes made from /admin, written by the security definer RPCs.';

alter table public.admin_audit_log enable row level security;

revoke all on table public.admin_audit_log from public, anon, authenticated;

create or replace function public.admin_set_committee_admin(
  p_user_id uuid,
  p_is_admin boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_is_admin boolean;
begin
  select email into v_admin_email from auth.users where id = v_admin_id;

  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1 from public.profiles as caller
      where caller.id = v_admin_id and caller.is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can change administrator access.';
  end if;

  if p_user_id is null or p_is_admin is null then
    raise exception using
      errcode = '22023',
      message = 'Select a member and administrator status.';
  end if;

  select target.is_committee_admin into v_is_admin
  from public.profiles as target
  where target.id = p_user_id;

  if v_is_admin is null then
    raise exception using
      errcode = '22023',
      message = 'The selected member does not exist.';
  end if;

  if not p_is_admin and v_is_admin then
    if not exists (
      select 1 from public.profiles as other_admin
      where other_admin.is_committee_admin and other_admin.id <> p_user_id
    ) then
      raise exception using
        errcode = '22023',
        message = 'There must always be at least one committee administrator.';
    end if;
  end if;

  if p_is_admin then
    update public.profiles
    set is_committee = true, is_committee_admin = true
    where id = p_user_id;
  else
    update public.profiles
    set is_committee_admin = false
    where id = p_user_id;
  end if;

  insert into public.admin_audit_log (actor_id, target_user_id, action)
  values (
    v_admin_id,
    p_user_id,
    case when p_is_admin then 'grant-admin' else 'revoke-admin' end
  );
end;
$$;

revoke all on function public.admin_set_committee_admin(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_committee_admin(uuid, boolean)
  to authenticated;

-- The access table needs to show who is already an administrator.
drop function public.admin_list_club_players();

create function public.admin_list_club_players()
returns table (
  user_id uuid,
  display_name text,
  player_level text,
  is_committee boolean,
  is_committee_admin boolean,
  can_choose_professional boolean
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
  select email into v_admin_email from auth.users where id = v_admin_id;
  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1 from public.profiles as caller
      where caller.id = v_admin_id and caller.is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can list club players.';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    profile.player_level,
    profile.is_committee,
    profile.is_committee_admin,
    profile.can_choose_professional
  from public.profiles as profile
  join auth.users as club_user on club_user.id = profile.id
  where private.is_club_email(club_user.email)
  order by profile.display_name, profile.id;
end;
$$;

revoke all on function public.admin_list_club_players()
  from public, anon, authenticated;
grant execute on function public.admin_list_club_players() to authenticated;
