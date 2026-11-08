-- BC-16: a committee member needs to fix one court without re-rolling the
-- whole schedule. The swap RPC only replaces a player with someone waiting;
-- these two let an administrator move a player to a specific court and time,
-- and take a player out of the timetable entirely.
--
-- Every change is audited and is allowed on a released timetable, because the
-- point of the feature is repairing a schedule that is already in players'
-- hands.

-- Team parcels are derived from `players` (first two, then the rest), so keep
-- them consistent after a move.
create or replace function private.timetable_game_with_teams(p_game jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public, private
as $$
  select jsonb_set(
    jsonb_set(
      p_game,
      '{teamA}',
      coalesce(
        (
          select jsonb_agg(entry.value order by entry.ord)
          from jsonb_array_elements(p_game -> 'players') with ordinality as entry(value, ord)
          where entry.ord <= 2
        ),
        '[]'::jsonb
      )
    ),
    '{teamB}',
    coalesce(
      (
        select jsonb_agg(entry.value order by entry.ord)
        from jsonb_array_elements(p_game -> 'players') with ordinality as entry(value, ord)
        where entry.ord > 2
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function private.timetable_game_with_teams(jsonb)
  from public, anon, authenticated;

create or replace function private.timetable_player_id(p_player jsonb)
returns text
language sql
immutable
as $$
  -- Saved games may hold either {"id": ...} objects or bare id strings.
  select case
    when p_player is null then null
    when jsonb_typeof(p_player) = 'string' then p_player #>> '{}'
    else p_player ->> 'id'
  end;
$$;

revoke all on function private.timetable_player_id(jsonb)
  from public, anon, authenticated;

create or replace function private.require_club_administrator()
returns uuid
language plpgsql
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
      message = 'Only a club administrator can repair a timetable.';
  end if;

  return v_admin_id;
end;
$$;

revoke all on function private.require_club_administrator()
  from public, anon, authenticated;

create or replace function public.admin_swap_session_players(
  p_session_id uuid,
  p_user_a_id uuid,
  p_user_b_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid;
  v_schedule jsonb;
  v_player_a jsonb;
  v_player_b jsonb;
  v_new_schedule jsonb;
  v_is_locked boolean;
begin
  v_admin_id := private.require_club_administrator();

  if p_session_id is null or p_user_a_id is null or p_user_b_id is null then
    raise exception using errcode = '22023', message = 'Choose two players to swap.';
  end if;

  if p_user_a_id = p_user_b_id then
    raise exception using errcode = '22023', message = 'Choose two different players.';
  end if;

  select timetable.court_schedule
  into v_schedule
  from public.session_timetables as timetable
  where timetable.session_id = p_session_id;

  if v_schedule is null then
    raise exception using
      errcode = '22023',
      message = 'There is no saved timetable to edit yet.';
  end if;

  select player.value
  into v_player_a
  from jsonb_array_elements(v_schedule) as game(value),
    jsonb_array_elements(game.value -> 'players') as player(value)
  where private.timetable_player_id(player.value) = p_user_a_id::text
  limit 1;

  select player.value
  into v_player_b
  from jsonb_array_elements(v_schedule) as game(value),
    jsonb_array_elements(game.value -> 'players') as player(value)
  where private.timetable_player_id(player.value) = p_user_b_id::text
  limit 1;

  if v_player_a is null then
    raise exception using
      errcode = '22023',
      message = 'That player is not currently in the timetable.';
  end if;

  if v_player_b is null then
    raise exception using
      errcode = '22023',
      message = 'That player is not currently in the timetable.';
  end if;

  -- A swap trades their whole night: every seat either player occupies.
  select jsonb_agg(
    private.timetable_game_with_teams(
      jsonb_set(
        game.value,
        '{players}',
        (
          select jsonb_agg(
            case
              when private.timetable_player_id(player.value) = p_user_a_id::text then v_player_b
              when private.timetable_player_id(player.value) = p_user_b_id::text then v_player_a
              else player.value
            end
            order by player.ord
          )
          from jsonb_array_elements(game.value -> 'players')
            with ordinality as player(value, ord)
        )
      )
    )
    order by game.ord
  )
  into v_new_schedule
  from jsonb_array_elements(v_schedule) with ordinality as game(value, ord);

  v_is_locked := private.session_timetable_is_locked(p_session_id);

  perform set_config('badminton.allow_locked_timetable_write', 'on', true);

  update public.session_timetables
  set court_schedule = v_new_schedule,
      generated_at = now(),
      generated_by = v_admin_id
  where session_id = p_session_id;

  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
  values (
    v_admin_id,
    p_user_b_id,
    'swap-seats',
    jsonb_build_object(
      'session_id', p_session_id,
      'player_a_id', p_user_a_id,
      'player_b_id', p_user_b_id,
      'was_locked', v_is_locked,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );
end;
$$;

revoke all on function public.admin_swap_session_players(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_swap_session_players(uuid, uuid, uuid, text)
  to authenticated;

create or replace function public.admin_place_session_player(
  p_session_id uuid,
  p_user_id uuid,
  p_court_number integer,
  p_start_at text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid;
  v_schedule jsonb;
  v_game jsonb;
  v_target_game integer;
  v_player jsonb;
  v_status text;
  v_slot integer;
  v_selected integer;
  v_capacity integer;
  v_new_schedule jsonb;
  v_is_locked boolean;
  v_places integer;
begin
  v_admin_id := private.require_club_administrator();

  if p_session_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'Choose a player to place.';
  end if;

  if p_court_number is null or p_court_number < 1 then
    raise exception using errcode = '22023', message = 'Choose a court.';
  end if;

  if p_start_at is null or btrim(p_start_at) = '' then
    raise exception using errcode = '22023', message = 'Choose a time.';
  end if;

  select timetable.court_schedule
  into v_schedule
  from public.session_timetables as timetable
  where timetable.session_id = p_session_id;

  if v_schedule is null then
    raise exception using
      errcode = '22023',
      message = 'There is no saved timetable to edit yet.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_schedule) as game(value),
      jsonb_array_elements(game.value -> 'players') as player(value)
    where private.timetable_player_id(player.value) = p_user_id::text
  ) then
    raise exception using
      errcode = '22023',
      message = 'That player is already in the timetable.';
  end if;

  select game.ord - 1, game.value
  into v_target_game, v_game
  from jsonb_array_elements(v_schedule) with ordinality as game(value, ord)
  where (game.value ->> 'courtNumber')::integer = p_court_number
    and (game.value ->> 'startAt') = p_start_at
  limit 1;

  if v_target_game is null then
    raise exception using
      errcode = '22023',
      message = 'That court and time is not part of this timetable.';
  end if;

  v_places := jsonb_array_length(v_game -> 'players');

  if v_places >= 4 then
    raise exception using
      errcode = '22023',
      message = 'That court is full. Swap two players instead.';
  end if;

  select signup.status, signup.slot_number
  into v_status, v_slot
  from public.session_signups as signup
  where signup.session_id = p_session_id and signup.user_id = p_user_id;

  if v_status is null then
    raise exception using
      errcode = '22023',
      message = 'That member is not signed up for this session.';
  end if;

  if v_status not in ('selected', 'played', 'requested', 'waitlisted') then
    raise exception using
      errcode = '22023',
      message = 'That member cannot be placed in this timetable.';
  end if;

  if v_status in ('requested', 'waitlisted') then
    select count(*) filter (where signup.status in ('selected', 'played'))
    into v_selected
    from public.session_signups as signup
    where signup.session_id = p_session_id;

    select session.capacity into v_capacity
    from public.sessions as session
    where session.id = p_session_id;

    if v_selected >= v_capacity then
      raise exception using
        errcode = '22023',
        message = 'Every place is already taken.';
    end if;
  end if;

  select jsonb_build_object(
    'id', profile.id,
    'displayName', profile.display_name,
    'level', profile.player_level,
    'priority', coalesce(v_slot, 1),
    'friendIds', '[]'::jsonb,
    'isCommittee', profile.is_committee
  )
  into v_player
  from public.profiles as profile
  where profile.id = p_user_id;

  select jsonb_agg(
    private.timetable_game_with_teams(
      case
        when game.ord - 1 = v_target_game then
          jsonb_set(
            game.value,
            '{players}',
            (game.value -> 'players') || jsonb_build_array(v_player)
          )
        else game.value
      end
    )
    order by game.ord
  )
  into v_new_schedule
  from jsonb_array_elements(v_schedule) with ordinality as game(value, ord);

  update public.session_signups
  set status = 'selected',
      slot_number = coalesce(v_slot, (
        select coalesce(max(signup.slot_number), 0) + 1
        from public.session_signups as signup
        where signup.session_id = p_session_id
      ))
  where session_id = p_session_id and user_id = p_user_id;

  v_is_locked := private.session_timetable_is_locked(p_session_id);

  perform set_config('badminton.allow_locked_timetable_write', 'on', true);

  update public.session_timetables
  set court_schedule = v_new_schedule,
      generated_at = now(),
      generated_by = v_admin_id
  where session_id = p_session_id;

  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
  values (
    v_admin_id,
    p_user_id,
    'place-player',
    jsonb_build_object(
      'session_id', p_session_id,
      'court_number', p_court_number,
      'start_at', p_start_at,
      'was_locked', v_is_locked,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );
end;
$$;

revoke all on function public.admin_place_session_player(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_place_session_player(uuid, uuid, integer, text, text)
  to authenticated;

create or replace function public.admin_remove_session_player(
  p_session_id uuid,
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid;
  v_schedule jsonb;
  v_found boolean;
  v_new_schedule jsonb;
  v_is_locked boolean;
begin
  v_admin_id := private.require_club_administrator();

  if p_session_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'Choose a player to take out.';
  end if;

  select timetable.court_schedule
  into v_schedule
  from public.session_timetables as timetable
  where timetable.session_id = p_session_id;

  if v_schedule is null then
    raise exception using
      errcode = '22023',
      message = 'There is no saved timetable to edit yet.';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(v_schedule) as game(value),
      jsonb_array_elements(game.value -> 'players') as player(value)
    where private.timetable_player_id(player.value) = p_user_id::text
  )
  into v_found;

  if not v_found then
    raise exception using
      errcode = '22023',
      message = 'That player is not currently in the timetable.';
  end if;

  select jsonb_agg(
    private.timetable_game_with_teams(
      jsonb_set(
        game.value,
        '{players}',
        coalesce(
          (
            select jsonb_agg(player.value order by player.ord)
            from jsonb_array_elements(game.value -> 'players')
              with ordinality as player(value, ord)
            where private.timetable_player_id(player.value) <> p_user_id::text
          ),
          '[]'::jsonb
        )
      )
    )
    order by game.ord
  )
  into v_new_schedule
  from jsonb_array_elements(v_schedule) with ordinality as game(value, ord);

  v_is_locked := private.session_timetable_is_locked(p_session_id);

  perform set_config('badminton.allow_locked_timetable_write', 'on', true);

  update public.session_timetables
  set court_schedule = v_new_schedule,
      generated_at = now(),
      generated_by = v_admin_id
  where session_id = p_session_id;

  update public.session_signups
  set status = 'waitlisted',
      slot_number = null
  where session_id = p_session_id and user_id = p_user_id;

  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
  values (
    v_admin_id,
    p_user_id,
    'remove-player',
    jsonb_build_object(
      'session_id', p_session_id,
      'was_locked', v_is_locked,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );
end;
$$;

revoke all on function public.admin_remove_session_player(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_remove_session_player(uuid, uuid, text)
  to authenticated;
