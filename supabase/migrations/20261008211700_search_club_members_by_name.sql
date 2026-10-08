create function public.find_club_members(p_query text)
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
    false
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
      when left(lower(split_part(club_user.email, '@', 1)), length(v_query)) = v_query then 1
      else 2
    end,
    lower(coalesce(nullif(btrim(profile.display_name), ''), '')),
    club_user.id
  limit 10;
end;
$$;

revoke all on function public.find_club_members(text)
  from public, anon, authenticated;
grant execute on function public.find_club_members(text)
  to authenticated;
