-- BC-16 follow-up: swapping two players traded their whole night, which is
-- almost never what the committee means. Tapping Jamie and Eugene is about the
-- one court on screen, so these RPCs now trade a single seat each.
--
-- A player can still play several rounds in a night, but never two courts at
-- once. Every edit therefore checks the rebuilt timetable and refuses a swap
-- or move that would put one member on two courts at the same time.

-- The new signatures take the seats, so the old four/five argument versions
-- have to go first: `create or replace` would create an ambiguous overload.
drop function if exists public.admin_swap_session_players(uuid, uuid, uuid, text);
drop function if exists public.admin_place_session_player(uuid, uuid, integer, text, text);

create or replace function public.admin_swap_session_players(
  p_session_id uuid,
  p_user_a_id uuid,
  p_court_a integer,
  p_start_a text,
  p_user_b_id uuid,
  p_court_b integer,
  p_start_b text,
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
  v_index_a integer;
  v_index_b integer;
  v_game_a jsonb;
  v_game_b jsonb;
  v_player_a jsonb;
  v_player_b jsonb;
  v_new_schedule jsonb;
  v_is_locked boolean;
  v_conflict_time text;
begin
  v_admin_id := private.require_club_administrator();

  if p_session_id is null or p_user_a_id is null or p_user_b_id is null then
    raise exception using errcode = '22023', message = 'Choose two players to swap.';
  end if;

  if p_user_a_id = p_user_b_id then
    raise exception using errcode = '22023', message = 'Choose two different players.';
  end if;

  if p_court_a is null or p_court_b is null
    or p_start_a is null or btrim(p_start_a) = ''
    or p_start_b is null or btrim(p_start_b) = '' then
    raise exception using errcode = '22023', message = 'Choose the seats to swap.';
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

  select game.ord - 1, game.value
  into v_index_a, v_game_a
  from jsonb_array_elements(v_schedule) with ordinality as game(value, ord)
  where (game.value ->> 'courtNumber')::integer = p_court_a
    and (game.value ->> 'startAt') = p_start_a
  limit 1;

  if v_index_a is null then
    raise exception using
      errcode = '22023',
      message = 'That court and time is not part of this timetable.';
  end if;

  select game.ord - 1, game.value
  into v_index_b, v_game_b
  from jsonb_array_elements(v_schedule) with ordinality as game(value, ord)
  where (game.value ->> 'courtNumber')::integer = p_court_b
    and (game.value ->> 'startAt') = p_start_b
  limit 1;

  if v_index_b is null then
    raise exception using
      errcode = '22023',
      message = 'That court and time is not part of this timetable.';
  end if;

  select player.value
  into v_player_a
  from jsonb_array_elements(v_game_a -> 'players') as player(value)
  where private.timetable_player_id(player.value) = p_user_a_id::text
  limit 1;

  if v_player_a is null then
    raise exception using
      errcode = '22023',
      message = 'That player is not on that court any more.';
  end if;

  select player.value
  into v_player_b
  from jsonb_array_elements(v_game_b -> 'players') as player(value)
  where private.timetable_player_id(player.value) = p_user_b_id::text
  limit 1;

  if v_player_b is null then
    raise exception using
      errcode = '22023',
      message = 'That player is not on that court any more.';
  end if;

  -- Swap the two seats, keeping every other game exactly as it was. The first
  -- branch also covers swapping two players inside the same court.
  select jsonb_agg(
    private.timetable_game_with_teams(
      case
        when game.ord - 1 = v_index_a then
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
        when game.ord - 1 = v_index_b then
          jsonb_set(
            game.value,
            '{players}',
            (
              select jsonb_agg(
                case
                  when private.timetable_player_id(player.value) = p_user_b_id::text then v_player_a
                  when private.timetable_player_id(player.value) = p_user_a_id::text then v_player_b
                  else player.value
                end
                order by player.ord
              )
              from jsonb_array_elements(game.value -> 'players')
                with ordinality as player(value, ord)
            )
          )
        else game.value
      end
    )
    order by game.ord
  )
  into v_new_schedule
  from jsonb_array_elements(v_schedule) with ordinality as game(value, ord);

  -- One member, one court per round. Both players are checked because a swap
  -- can move either of them into a round where they already play.
  select game.value ->> 'startAt'
  into v_conflict_time
  from jsonb_array_elements(v_new_schedule) as game(value),
    jsonb_array_elements(game.value -> 'players') as player(value)
  where (game.value ->> 'startAt') in (p_start_a, p_start_b)
    and private.timetable_player_id(player.value) = p_user_a_id::text
  group by game.value ->> 'startAt'
  having count(*) > 1
  limit 1;

  if v_conflict_time is not null then
    raise exception using
      errcode = '22023',
      message = format(
        'That swap would put %s on two courts at %s.',
        coalesce(v_player_a ->> 'displayName', 'that player'),
        v_conflict_time
      );
  end if;

  select game.value ->> 'startAt'
  into v_conflict_time
  from jsonb_array_elements(v_new_schedule) as game(value),
    jsonb_array_elements(game.value -> 'players') as player(value)
  where (game.value ->> 'startAt') in (p_start_a, p_start_b)
    and private.timetable_player_id(player.value) = p_user_b_id::text
  group by game.value ->> 'startAt'
  having count(*) > 1
  limit 1;

  if v_conflict_time is not null then
    raise exception using
      errcode = '22023',
      message = format(
        'That swap would put %s on two courts at %s.',
        coalesce(v_player_b ->> 'displayName', 'that player'),
        v_conflict_time
      );
  end if;

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
      'court_a', p_court_a,
      'start_a', p_start_a,
      'court_b', p_court_b,
      'start_b', p_start_b,
      'was_locked', v_is_locked,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );
end;
$$;

revoke all on function public.admin_swap_session_players(uuid, uuid, integer, text, uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_swap_session_players(uuid, uuid, integer, text, uuid, integer, text, text)
  to authenticated;

create or replace function public.admin_place_session_player(
  p_session_id uuid,
  p_user_id uuid,
  p_court_number integer,
  p_start_at text,
  p_reason text default null,
  p_from_court_number integer default null,
  p_from_start_at text default null
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
  v_from_game integer;
  v_from_value jsonb;
  v_player jsonb;
  v_in_timetable boolean;
  v_status text;
  v_slot integer;
  v_selected integer;
  v_capacity integer;
  v_new_schedule jsonb;
  v_is_locked boolean;
  v_places integer;
  v_conflict_time text;
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

  select exists (
    select 1
    from jsonb_array_elements(v_schedule) as game(value),
      jsonb_array_elements(game.value -> 'players') as player(value)
    where private.timetable_player_id(player.value) = p_user_id::text
  )
  into v_in_timetable;

  if v_in_timetable then
    -- Moving a player who is already in the timetable changes only the seat
    -- they were tapped on. Their other games stay where they are.
    if p_from_court_number is null
      or p_from_start_at is null
      or btrim(p_from_start_at) = '' then
      raise exception using
        errcode = '22023',
        message = 'Pick the seat that player is moving from.';
    end if;

    select game.ord - 1, game.value
    into v_from_game, v_from_value
    from jsonb_array_elements(v_schedule) with ordinality as game(value, ord)
    where (game.value ->> 'courtNumber')::integer = p_from_court_number
      and (game.value ->> 'startAt') = p_from_start_at
    limit 1;

    if v_from_game is null then
      raise exception using
        errcode = '22023',
        message = 'That court and time is not part of this timetable.';
    end if;

    select player.value
    into v_player
    from jsonb_array_elements(v_from_value -> 'players') as player(value)
    where private.timetable_player_id(player.value) = p_user_id::text
    limit 1;

    if v_player is null then
      raise exception using
        errcode = '22023',
        message = 'That player is not on that court any more.';
    end if;

    if v_from_game = v_target_game then
      return;
    end if;

    select jsonb_agg(
      private.timetable_game_with_teams(
        case
          when game.ord - 1 = v_from_game then
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

    select game.value ->> 'startAt'
    into v_conflict_time
    from jsonb_array_elements(v_new_schedule) as game(value),
      jsonb_array_elements(game.value -> 'players') as player(value)
    where (game.value ->> 'startAt') = p_start_at
      and private.timetable_player_id(player.value) = p_user_id::text
    group by game.value ->> 'startAt'
    having count(*) > 1;

    if v_conflict_time is not null then
      raise exception using
        errcode = '22023',
        message = format(
          '%s is already playing on another court at %s.',
          coalesce(v_player ->> 'displayName', 'That player'),
          v_conflict_time
        );
    end if;
  else
    -- Placing a member who is not in the timetable yet (a waitlisted or
    -- requested signup) still adds them to the roster.
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
  end if;

  v_is_locked := private.session_timetable_is_locked(p_session_id);

  perform set_config('badminton.allow_locked_timetable_write', 'on', true);

  update public.session_timetables
  set court_schedule = v_new_schedule,
      generated_at = now(),
      generated_by = v_admin_id
  where session_id = p_session_id;

  if not v_in_timetable then
    update public.session_signups
    set status = 'selected',
        slot_number = coalesce(v_slot, (
          select coalesce(max(signup.slot_number), 0) + 1
          from public.session_signups as signup
          where signup.session_id = p_session_id
        ))
    where session_id = p_session_id and user_id = p_user_id;
  end if;

  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
  values (
    v_admin_id,
    p_user_id,
    case when v_in_timetable then 'move-player' else 'place-player' end,
    jsonb_build_object(
      'session_id', p_session_id,
      'court_number', p_court_number,
      'start_at', p_start_at,
      'from_court_number', case when v_in_timetable then p_from_court_number end,
      'from_start_at', case when v_in_timetable then p_from_start_at end,
      'was_locked', v_is_locked,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );
end;
$$;

revoke all on function public.admin_place_session_player(uuid, uuid, integer, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_place_session_player(uuid, uuid, integer, text, text, integer, text)
  to authenticated;
