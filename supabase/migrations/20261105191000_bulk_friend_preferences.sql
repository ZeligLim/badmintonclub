-- Bulk form of get_session_friend_preferences: the dashboard was calling the
-- single-session version once per open session, which is a round trip per
-- session for the same set of people.

create or replace function public.get_session_friend_preferences_bulk(
  p_session_ids uuid[]
)
returns table (
  session_id uuid,
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

  return query
  with target as (
    select s.id
    from public.sessions s
    where s.id = any(p_session_ids)
      and s.status in ('open', 'confirmed')
  ),
  session_friends as (
    select
      preference.session_id,
      preference.friend_user_id as user_id,
      true as is_selected
    from public.session_friend_preferences as preference
    join target t on t.id = preference.session_id
    where preference.user_id = v_user_id

    union

    select
      t.id as session_id,
      cfl.friend_user_id as user_id,
      false as is_selected
    from public.club_friend_list as cfl
    cross join target t
    where cfl.user_id = v_user_id
  ),
  distinct_friends as (
    select
      sf.session_id,
      sf.user_id,
      bool_or(sf.is_selected) as is_selected
    from session_friends sf
    group by sf.session_id, sf.user_id
  )
  select
    df.session_id,
    friend_user.id,
    coalesce(nullif(btrim(profile.display_name), ''), split_part(lower(friend_user.email), '@', 1)),
    split_part(lower(friend_user.email), '@', 1),
    coalesce(profile.player_level, 'INTERMEDIATE'),
    df.is_selected,
    exists (
      select 1
      from public.session_signups as ss
      where ss.session_id = df.session_id
        and ss.user_id = friend_user.id
        and ss.status in ('requested', 'selected', 'played')
    ) as is_signed_up
  from distinct_friends as df
  join auth.users as friend_user on friend_user.id = df.user_id
  left join public.profiles as profile on profile.id = friend_user.id
  where private.is_club_email(friend_user.email)
  order by df.session_id, df.is_selected desc, profile.display_name nulls last, friend_user.id;
end;
$$;

revoke all on function public.get_session_friend_preferences_bulk(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_session_friend_preferences_bulk(uuid[])
  to authenticated;
