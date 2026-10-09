create table public.club_friend_list (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id),
  constraint club_friend_list_not_self check (user_id <> friend_user_id)
);

alter table public.club_friend_list enable row level security;
revoke all on table public.club_friend_list from public, anon, authenticated;
grant all on table public.club_friend_list to service_role;

create function public.get_my_friend_list()
returns table (
  user_id uuid,
  display_name text,
  student_id text,
  player_level text
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
    raise exception using errcode = '28000', message = 'Sign in to view your friend list.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can view a friend list.';
  end if;

  return query
  select
    friend_user.id,
    coalesce(
      nullif(btrim(profile.display_name), ''),
      split_part(lower(friend_user.email), '@', 1)
    ),
    split_part(lower(friend_user.email), '@', 1),
    coalesce(profile.player_level, 'INTERMEDIATE')
  from public.club_friend_list as friend
  join auth.users as friend_user on friend_user.id = friend.friend_user_id
  join public.profiles as profile on profile.id = friend_user.id
  where friend.user_id = v_user_id
    and private.is_club_email(friend_user.email)
  order by lower(profile.display_name), friend_user.id;
end;
$$;

revoke all on function public.get_my_friend_list()
  from public, anon, authenticated;
grant execute on function public.get_my_friend_list()
  to authenticated;

create function public.add_my_friend(p_friend_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_friend_email text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to add a friend.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can add friends.';
  end if;

  if p_friend_user_id is null or p_friend_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'Choose another club member as a friend.';
  end if;

  select email into v_friend_email
  from auth.users
  where id = p_friend_user_id;

  if v_friend_email is null
    or not private.is_club_email(v_friend_email)
    or not exists (
      select 1 from public.profiles where id = p_friend_user_id
    ) then
    raise exception using errcode = '22023', message = 'Choose an existing ATU club member.';
  end if;

  insert into public.club_friend_list (user_id, friend_user_id)
  values (v_user_id, p_friend_user_id)
  on conflict (user_id, friend_user_id) do nothing;
end;
$$;

revoke all on function public.add_my_friend(uuid)
  from public, anon, authenticated;
grant execute on function public.add_my_friend(uuid)
  to authenticated;

create function public.remove_my_friend(p_friend_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to remove a friend.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can remove friends.';
  end if;

  delete from public.club_friend_list
  where user_id = v_user_id
    and friend_user_id = p_friend_user_id;
end;
$$;

revoke all on function public.remove_my_friend(uuid)
  from public, anon, authenticated;
grant execute on function public.remove_my_friend(uuid)
  to authenticated;
