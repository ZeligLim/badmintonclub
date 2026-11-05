-- One round trip for everything the dashboard needs to build a timetable.
--
-- The member dashboard used to read every confirmed session's roster, friend
-- preferences and club friend list with the service-role key. That put the
-- whole club's data through every page load and needed a privileged client in a
-- public page. This function does the same joins once, for the club members the
-- caller can already see on a published timetable.

create or replace function public.get_schedule_inputs(p_session_ids uuid[])
returns table (
  session_id uuid,
  user_id uuid,
  display_name text,
  slot_number integer,
  is_committee boolean,
  player_level text,
  friend_ids uuid[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select s.id
    from public.sessions s
    where s.id = any(p_session_ids)
  ),
  roster as (
    select ss.session_id, ss.user_id, ss.slot_number
    from public.session_signups ss
    join target t on t.id = ss.session_id
    where ss.status in ('selected', 'played')
  )
  select
    r.session_id,
    r.user_id,
    p.display_name,
    r.slot_number,
    p.is_committee,
    p.player_level::text,
    coalesce(
      (
        select array_agg(distinct friend_id)
        from (
          select sfp.friend_user_id as friend_id
          from public.session_friend_preferences sfp
          where sfp.session_id = r.session_id
            and sfp.user_id = r.user_id
          union
          select cfl.friend_user_id
          from public.club_friend_list cfl
          where cfl.user_id = r.user_id
            and exists (
              select 1
              from roster mate
              where mate.session_id = r.session_id
                and mate.user_id = cfl.friend_user_id
            )
        ) friends
      ),
      '{}'::uuid[]
    )
  from roster r
  join public.profiles p on p.id = r.user_id
  order by r.session_id, r.slot_number nulls last, r.user_id;
$$;

revoke all on function public.get_schedule_inputs(uuid[]) from public, anon;
grant execute on function public.get_schedule_inputs(uuid[]) to authenticated;

-- Indexes the dashboard and finalisation actually look up by.
create index if not exists session_friend_preferences_session_user_idx
  on public.session_friend_preferences (session_id, user_id);
create index if not exists club_friend_list_friend_idx
  on public.club_friend_list (friend_user_id, user_id);
