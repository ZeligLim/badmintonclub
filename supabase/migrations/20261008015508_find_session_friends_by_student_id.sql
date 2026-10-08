drop function public.get_friend_candidates(uuid);

create function public.get_session_friend_preferences(p_session_id uuid)
returns table (
  user_id uuid,
  display_name text,
  student_id text,
  player_level text,
  is_selected boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to view saved friend choices.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can view saved friend choices.';
  end if;
  if not exists (
    select 1 from public.sessions
    where id = p_session_id and status = 'open'
  ) then
    raise exception using errcode = 'P0001', message = 'Saved friend choices are only available before session confirmation.';
  end if;

  return query
  select
    friend_user.id,
    coalesce(nullif(btrim(profile.display_name), ''), split_part(lower(friend_user.email), '@', 1)),
    split_part(lower(friend_user.email), '@', 1),
    coalesce(profile.player_level, 'INTERMEDIATE'),
    true
  from public.session_friend_preferences as preference
  join auth.users as friend_user on friend_user.id = preference.friend_user_id
  left join public.profiles as profile on profile.id = friend_user.id
  where preference.session_id = p_session_id
    and preference.user_id = v_user_id
    and private.is_club_email(friend_user.email)
  order by profile.display_name nulls last, friend_user.id;
end;
$$;

revoke all on function public.get_session_friend_preferences(uuid)
  from public, anon, authenticated;
grant execute on function public.get_session_friend_preferences(uuid)
  to authenticated;

create function public.find_club_member_by_student_id(p_student_id text)
returns table (
  user_id uuid,
  display_name text,
  student_id text,
  player_level text,
  is_selected boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_student_id text := lower(btrim(coalesce(p_student_id, '')));
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to look up a club member.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can look up a club member.';
  end if;
  if v_student_id !~ '^[a-z0-9]{1,64}$' then
    raise exception using errcode = '22023', message = 'Enter a valid ATU student ID.';
  end if;

  return query
  select
    club_user.id,
    coalesce(nullif(btrim(profile.display_name), ''), v_student_id),
    split_part(lower(club_user.email), '@', 1),
    coalesce(profile.player_level, 'INTERMEDIATE'),
    false
  from auth.users as club_user
  left join public.profiles as profile on profile.id = club_user.id
  where club_user.id <> v_user_id
    and lower(split_part(club_user.email, '@', 1)) = v_student_id
    and private.is_club_email(club_user.email)
  limit 1;
end;
$$;

revoke all on function public.find_club_member_by_student_id(text)
  from public, anon, authenticated;
grant execute on function public.find_club_member_by_student_id(text)
  to authenticated;
