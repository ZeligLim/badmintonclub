alter table public.profiles
  add column can_choose_professional boolean not null default false;

update public.profiles
set can_choose_professional = true
where player_level = 'PROFESSIONAL';

create or replace function public.update_my_player_level(p_player_level text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_can_choose_professional boolean;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to update your player level.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can update their level.';
  end if;

  select can_choose_professional
  into v_can_choose_professional
  from public.profiles
  where id = v_user_id;

  if p_player_level is null
    or p_player_level not in ('BEGINNER', 'INTERMEDIATE', 'PROFESSIONAL')
    or (
      p_player_level = 'PROFESSIONAL'
      and not coalesce(v_can_choose_professional, false)
    ) then
    raise exception using
      errcode = '22023',
      message = 'Professional level is not available for this member.';
  end if;

  update public.profiles
  set player_level = p_player_level
  where id = v_user_id;
end;
$$;

create or replace function public.admin_update_player_access(
  p_user_id uuid,
  p_player_level text,
  p_is_committee boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_email text;
begin
  select email into v_admin_email from auth.users where id = v_admin_id;
  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1 from public.profiles
      where id = v_admin_id and is_committee_admin
    ) then
    raise exception using errcode = '42501', message = 'Only a club administrator can change player access.';
  end if;
  if p_player_level is null
    or p_player_level not in ('BEGINNER', 'INTERMEDIATE', 'PROFESSIONAL')
    or p_is_committee is null then
    raise exception using errcode = '22023', message = 'Select a valid player level.';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '22023', message = 'The selected player is not an eligible club member.';
  end if;

  update public.profiles
  set player_level = p_player_level,
      is_committee = p_is_committee,
      can_choose_professional = can_choose_professional
        or p_player_level = 'PROFESSIONAL'
  where id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'The selected player profile was not found.';
  end if;
end;
$$;

drop function public.admin_list_club_players();

create function public.admin_list_club_players()
returns table (
  user_id uuid,
  display_name text,
  player_level text,
  is_committee boolean,
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
      select 1 from public.profiles
      where id = v_admin_id and is_committee_admin
    ) then
    raise exception using errcode = '42501', message = 'Only a club administrator can list club players.';
  end if;

  return query
  select
    profile.id,
    profile.display_name,
    profile.player_level,
    profile.is_committee,
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

create function public.admin_set_professional_choice(
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_member_email text;
begin
  select email into v_admin_email from auth.users where id = v_admin_id;
  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1 from public.profiles
      where id = v_admin_id and is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can change Professional level access.';
  end if;

  if p_user_id is null or p_enabled is null then
    raise exception using errcode = '22023', message = 'Select a member and access state.';
  end if;

  select email into v_member_email from auth.users where id = p_user_id;
  if not private.is_club_email(v_member_email) then
    raise exception using
      errcode = '22023',
      message = 'The selected player is not an eligible club member.';
  end if;

  update public.profiles
  set can_choose_professional = p_enabled,
      player_level = case
        when not p_enabled and player_level = 'PROFESSIONAL'
          then 'INTERMEDIATE'
        else player_level
      end
  where id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'The selected player profile was not found.';
  end if;
end;
$$;

revoke all on function public.admin_set_professional_choice(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_professional_choice(uuid, boolean)
  to authenticated;