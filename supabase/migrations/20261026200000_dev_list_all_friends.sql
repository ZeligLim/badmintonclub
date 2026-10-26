drop function if exists public.list_dev_test_users();
create or replace function public.list_dev_test_users()
returns table (
  id uuid,
  email text,
  display_name text,
  player_level text,
  is_committee boolean,
  is_committee_admin boolean,
  friend_count bigint,
  configured_friend_emails text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(((select auth.jwt()) ->> 'role'), '') not in ('service_role', 'postgres') then
    raise exception using errcode = '42501', message = 'Only service role can list dev test users.';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.display_name,
    p.player_level,
    coalesce(p.is_committee, false),
    coalesce(p.is_committee_admin, false),
    (select count(*) from public.club_friend_list f where f.user_id = u.id),
    coalesce(
      (select array_agg(fu.email::text order by fu.email)
       from public.club_friend_list f
       join auth.users fu on fu.id = f.friend_user_id
       where f.user_id = u.id),
      '{}'::text[]
    )
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.email ilike '%@atu.ie'
  order by u.email;
end;
$$;

revoke all on function public.list_dev_test_users() from public, anon, authenticated;
grant execute on function public.list_dev_test_users() to service_role;
