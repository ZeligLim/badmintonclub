-- Add is_signed_up boolean to get_session_friend_preferences and include friends from friend list
drop function if exists public.get_session_friend_preferences(uuid);

create function public.get_session_friend_preferences(p_session_id uuid)
returns table (
  user_id uuid,
  display_name text,
  student_id text,
  player_level text,
  is_selected boolean,
  is_signed_up boolean
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
    where id = p_session_id and status in ('open', 'confirmed')
  ) then
    raise exception using errcode = 'P0001', message = 'Saved friend choices are not available for this session.';
  end if;

  return query
  with session_friends as (
    -- 1. Explicitly selected friends for this session
    select
      preference.friend_user_id as user_id,
      true as is_selected
    from public.session_friend_preferences as preference
    where preference.session_id = p_session_id
      and preference.user_id = v_user_id

    union

    -- 2. Friends on the user's permanent friend list
    select
      cfl.friend_user_id as user_id,
      false as is_selected
    from public.club_friend_list as cfl
    where cfl.user_id = v_user_id
  ),
  distinct_friends as (
    select
      sf.user_id,
      bool_or(sf.is_selected) as is_selected
    from session_friends sf
    group by sf.user_id
  )
  select
    friend_user.id,
    coalesce(nullif(btrim(profile.display_name), ''), split_part(lower(friend_user.email), '@', 1)),
    split_part(lower(friend_user.email), '@', 1),
    coalesce(profile.player_level, 'INTERMEDIATE'),
    df.is_selected,
    exists (
      select 1
      from public.session_signups as ss
      where ss.session_id = p_session_id
        and ss.user_id = friend_user.id
        and ss.status in ('requested', 'selected', 'played')
    ) as is_signed_up
  from distinct_friends as df
  join auth.users as friend_user on friend_user.id = df.user_id
  left join public.profiles as profile on profile.id = friend_user.id
  where private.is_club_email(friend_user.email)
  order by df.is_selected desc, profile.display_name nulls last, friend_user.id;
end;
$$;

revoke all on function public.get_session_friend_preferences(uuid)
  from public, anon, authenticated;
grant execute on function public.get_session_friend_preferences(uuid)
  to authenticated;

-- Update find_club_members to also return is_signed_up if p_session_id is provided
drop function if exists public.find_club_members(text);

create function public.find_club_members(
  p_query text,
  p_session_id uuid default null
)
returns table (
  user_id uuid,
  display_name text,
  student_id text,
  player_level text,
  is_selected boolean,
  is_signed_up boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_query text := lower(btrim(coalesce(p_query, '')));
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to look up a club member.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can look up a club member.';
  end if;
  if length(v_query) < 2 or length(v_query) > 64 then
    raise exception using errcode = '22023', message = 'Search using at least two characters.';
  end if;

  return query
  select
    club_user.id,
    coalesce(
      nullif(btrim(profile.display_name), ''),
      split_part(lower(club_user.email), '@', 1)
    ),
    split_part(lower(club_user.email), '@', 1),
    coalesce(profile.player_level, 'INTERMEDIATE'),
    false,
    case
      when p_session_id is null then false
      else exists (
        select 1
        from public.session_signups as ss
        where ss.session_id = p_session_id
          and ss.user_id = club_user.id
          and ss.status in ('requested', 'selected', 'played')
      )
    end as is_signed_up
  from auth.users as club_user
  left join public.profiles as profile on profile.id = club_user.id
  where club_user.id <> v_user_id
    and private.is_club_email(club_user.email)
    and (
      position(
        v_query in lower(coalesce(
          nullif(btrim(profile.display_name), ''),
          split_part(lower(club_user.email), '@', 1)
        ))
      ) > 0
      or left(
        lower(split_part(club_user.email, '@', 1)),
        length(v_query)
      ) = v_query
    )
  order by
    case
      when lower(split_part(club_user.email, '@', 1)) = v_query then 0
      else 1
    end,
    profile.display_name nulls last,
    club_user.id
  limit 10;
end;
$$;

revoke all on function public.find_club_members(text, uuid)
  from public, anon, authenticated;
grant execute on function public.find_club_members(text, uuid)
  to authenticated;
