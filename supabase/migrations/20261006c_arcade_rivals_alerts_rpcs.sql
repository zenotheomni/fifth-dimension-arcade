-- arcade_rivals_alerts_rpcs: helpers + token-checked SECURITY DEFINER RPCs for boards, challenges, rivals, inbox, push.
-- ── internal helpers ──

CREATE OR REPLACE FUNCTION public.arcade_week_start()
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$ SELECT (date_trunc('week', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York') $$;

CREATE OR REPLACE FUNCTION public.arcade_board_ranked(p_game_id text, p_window text)
RETURNS TABLE (rank bigint, player_id uuid, handle text, score int, achieved_at timestamptz)
LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  WITH b AS (SELECT modes FROM public.arcade_boards WHERE game_id = p_game_id),
  best AS (
    SELECT DISTINCT ON (s.player_id) s.player_id, s.score, s.created_at
    FROM public.arcade_scores s, b
    WHERE s.game_id = p_game_id AND s.mode = ANY (b.modes)
      AND (p_window = 'alltime' OR s.created_at >= public.arcade_week_start())
    ORDER BY s.player_id, s.score DESC, s.created_at ASC
  )
  SELECT row_number() OVER (ORDER BY best.score DESC, best.created_at ASC),
         best.player_id, p.handle, best.score, best.created_at
  FROM best JOIN public.arcade_players p ON p.id = best.player_id
$$;

CREATE OR REPLACE FUNCTION public.arcade_h2h(p_game_id text, p_me uuid, p_them uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'me_wins', CASE WHEN r.player_lo = p_me THEN r.lo_wins ELSE r.hi_wins END,
      'them_wins', CASE WHEN r.player_lo = p_me THEN r.hi_wins ELSE r.lo_wins END,
      'ties', r.ties,
      'games', r.lo_wins + r.hi_wins + r.ties,
      'last_played_at', r.last_played_at,
      'last_winner', CASE WHEN r.last_played_at IS NULL THEN NULL
                          WHEN r.last_winner_id IS NULL THEN 'tie'
                          WHEN r.last_winner_id = p_me THEN 'me' ELSE 'them' END)
    FROM public.arcade_rivalries r
    WHERE r.game_id = p_game_id AND r.player_lo = least(p_me, p_them) AND r.player_hi = greatest(p_me, p_them)
  ), jsonb_build_object('me_wins', 0, 'them_wins', 0, 'ties', 0, 'games', 0, 'last_played_at', NULL, 'last_winner', NULL))
$$;

CREATE OR REPLACE FUNCTION public.arcade_h2h_text(p_me_handle text, p_them_handle text, p_h2h jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN (p_h2h->>'me_wins')::int > (p_h2h->>'them_wins')::int
      THEN p_me_handle || ' leads ' || (p_h2h->>'me_wins') || '–' || (p_h2h->>'them_wins')
    WHEN (p_h2h->>'me_wins')::int < (p_h2h->>'them_wins')::int
      THEN p_them_handle || ' leads ' || (p_h2h->>'them_wins') || '–' || (p_h2h->>'me_wins')
    ELSE 'Series tied ' || (p_h2h->>'me_wins') || '–' || (p_h2h->>'them_wins') END
$$;

CREATE OR REPLACE FUNCTION public.arcade_alert(p_to uuid, p_actor uuid, p_kind text, p_challenge_id text,
  p_title text, p_body text, p_url text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp
AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.arcade_alerts (player_id, actor_player_id, kind, challenge_id, title, body, url, payload, push_status)
  VALUES (p_to, p_actor, p_kind, p_challenge_id, left(p_title, 120), left(coalesce(p_body, ''), 240),
          coalesce(p_url, '/arcade'), coalesce(p_payload, '{}'::jsonb),
          CASE WHEN EXISTS (SELECT 1 FROM public.arcade_push_subscriptions s WHERE s.player_id = p_to)
               THEN 'pending' ELSE 'no_subscription' END)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_new_seed(p_kind text)
RETURNS text LANGUAGE sql VOLATILE SET search_path = public, extensions, pg_temp
AS $$ SELECT p_kind || ':' || encode(extensions.gen_random_bytes(6), 'hex') $$;

-- Insert a challenge + creator entry. Enforces 20 challenges / player / hour.
CREATE OR REPLACE FUNCTION public.arcade_make_challenge(p_creator uuid, p_game_id text, p_score int, p_seed text,
  p_opponent uuid, p_parent text, p_score_id uuid)
RETURNS public.arcade_challenges LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp
AS $$
DECLARE v_row public.arcade_challenges%ROWTYPE;
BEGIN
  IF (SELECT count(*) FROM public.arcade_challenges c
      WHERE c.creator_player_id = p_creator AND c.created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.arcade_challenges (id, game_id, mode, creator_player_id, target_score, seed,
    opponent_player_id, parent_challenge_id, creator_score_id)
  VALUES (public.arcade_new_challenge_id(), p_game_id, 'challenge', p_creator, p_score, left(p_seed, 128),
    p_opponent, p_parent, p_score_id)
  RETURNING * INTO v_row;
  INSERT INTO public.arcade_challenge_entries (challenge_id, player_id, role, status, score, score_id, finished_at)
  VALUES (v_row.id, p_creator, 'creator', 'finished', p_score, p_score_id, now());
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_challenge_json(c public.arcade_challenges)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'game_id', c.game_id, 'mode', c.mode, 'target_score', c.target_score, 'seed', c.seed,
    'creator_player_id', c.creator_player_id,
    'creator_handle', (SELECT handle FROM public.arcade_players WHERE id = c.creator_player_id),
    'opponent_player_id', c.opponent_player_id,
    'opponent_handle', (SELECT handle FROM public.arcade_players WHERE id = c.opponent_player_id),
    'parent_challenge_id', c.parent_challenge_id,
    'created_at', c.created_at, 'expires_at', c.expires_at, 'expired', c.expires_at < now())
$$;

-- ── public RPCs ──

-- Top-N board with the caller's rank (one best score per player; all scores stay stored).
CREATE OR REPLACE FUNCTION public.arcade_board(p_game_id text, p_window text DEFAULT 'alltime',
  p_player_id uuid DEFAULT NULL, p_limit int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_board public.arcade_boards%ROWTYPE;
  v_window text := lower(coalesce(p_window, 'alltime'));
  v_limit int;
  v_entries jsonb;
  v_me jsonb;
  v_total bigint;
BEGIN
  SELECT * INTO v_board FROM public.arcade_boards WHERE game_id = p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_game' USING ERRCODE = '22023'; END IF;
  IF v_window NOT IN ('alltime', 'weekly') THEN RAISE EXCEPTION 'invalid_window' USING ERRCODE = '22023'; END IF;
  v_limit := least(greatest(coalesce(p_limit, v_board.size), 1), 25);

  WITH r AS (SELECT * FROM public.arcade_board_ranked(p_game_id, v_window))
  SELECT
    coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'player_id', r.player_id, 'handle', r.handle,
      'score', r.score, 'created_at', r.achieved_at, 'is_me', r.player_id IS NOT DISTINCT FROM p_player_id)
      ORDER BY r.rank) FILTER (WHERE r.rank <= v_limit), '[]'::jsonb),
    (SELECT jsonb_build_object('rank', m.rank, 'score', m.score, 'handle', m.handle) FROM r m WHERE m.player_id = p_player_id),
    count(*)
  INTO v_entries, v_me, v_total
  FROM r;

  RETURN jsonb_build_object('game_id', p_game_id, 'window', v_window, 'modes', to_jsonb(v_board.modes),
    'size', v_board.size, 'label', v_board.label, 'entries', v_entries, 'me', v_me, 'total', v_total);
END;
$$;

-- Issue a server-generated seed for a "set the bar" or rematch run.
CREATE OR REPLACE FUNCTION public.arcade_issue_ticket(p_device_id text, p_token text, p_game_id text,
  p_rival_player_id uuid DEFAULT NULL, p_parent_challenge_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_player public.arcade_players%ROWTYPE;
  v_game public.arcade_games%ROWTYPE;
  v_row public.arcade_seed_tickets%ROWTYPE;
  v_rival_handle text;
BEGIN
  v_player := public.arcade_auth(p_device_id, p_token);
  SELECT * INTO v_game FROM public.arcade_games WHERE id = p_game_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_game' USING ERRCODE = '22023'; END IF;
  IF v_game.status = 'coming_soon' THEN RAISE EXCEPTION 'game_not_live' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM public.arcade_seed_tickets t
      WHERE t.player_id = v_player.id AND t.created_at > now() - interval '1 hour') >= 30
     OR (SELECT count(*) FROM public.arcade_challenges c
      WHERE c.creator_player_id = v_player.id AND c.created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '54000';
  END IF;
  IF p_rival_player_id IS NOT NULL THEN
    IF p_rival_player_id = v_player.id OR NOT EXISTS (
      SELECT 1 FROM public.arcade_rivalries r WHERE r.game_id = p_game_id
        AND r.player_lo = least(v_player.id, p_rival_player_id) AND r.player_hi = greatest(v_player.id, p_rival_player_id)
    ) THEN
      RAISE EXCEPTION 'not_rivals' USING ERRCODE = '22023';
    END IF;
    SELECT handle INTO v_rival_handle FROM public.arcade_players WHERE id = p_rival_player_id;
  END IF;
  IF p_parent_challenge_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.arcade_challenges WHERE id = p_parent_challenge_id) THEN
    p_parent_challenge_id := NULL;
  END IF;
  INSERT INTO public.arcade_seed_tickets (player_id, game_id, seed, opponent_player_id, parent_challenge_id)
  VALUES (v_player.id, p_game_id, public.arcade_new_seed('sway'), p_rival_player_id, p_parent_challenge_id)
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ticket_id', v_row.id, 'seed', v_row.seed, 'game_id', v_row.game_id,
    'rival_player_id', v_row.opponent_player_id, 'rival_handle', v_rival_handle);
END;
$$;

-- Turn an already-submitted 60s score into an open challenge (same conditions for the friend).
CREATE OR REPLACE FUNCTION public.arcade_challenge_from_score(p_device_id text, p_token text, p_score_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_player public.arcade_players%ROWTYPE;
  v_score public.arcade_scores%ROWTYPE;
  v_existing public.arcade_challenges%ROWTYPE;
  v_row public.arcade_challenges%ROWTYPE;
  v_seed text;
BEGIN
  v_player := public.arcade_auth(p_device_id, p_token);
  SELECT * INTO v_score FROM public.arcade_scores WHERE id = p_score_id AND player_id = v_player.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'score_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_score.created_at < now() - interval '6 hours' THEN RAISE EXCEPTION 'score_too_old' USING ERRCODE = '22023'; END IF;
  IF v_score.mode NOT IN ('timed60', 'challenge') THEN RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_existing FROM public.arcade_challenges
  WHERE creator_score_id = v_score.id ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND v_existing.opponent_player_id IS NULL AND v_existing.expires_at > now() THEN
    RETURN public.arcade_challenge_json(v_existing) || jsonb_build_object('reused', true);
  END IF;

  v_seed := coalesce(
    v_existing.seed,
    (SELECT c.seed FROM public.arcade_challenges c WHERE c.id = v_score.challenge_id),
    public.arcade_new_seed('still'));
  v_row := public.arcade_make_challenge(v_player.id, v_score.game_id, v_score.score, v_seed, NULL, NULL, v_score.id);
  RETURN public.arcade_challenge_json(v_row) || jsonb_build_object('reused', false);
END;
$$;

-- Friend opened the challenge and hit "Accept": mark started, alert the creator.
CREATE OR REPLACE FUNCTION public.arcade_challenge_start(p_device_id text, p_token text, p_challenge_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_player public.arcade_players%ROWTYPE;
  v_chal public.arcade_challenges%ROWTYPE;
  v_entry public.arcade_challenge_entries%ROWTYPE;
  v_alerts int := 0;
BEGIN
  v_player := public.arcade_auth(p_device_id, p_token);
  SELECT * INTO v_chal FROM public.arcade_challenges WHERE id = trim(coalesce(p_challenge_id, ''));
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_chal.expires_at < now() THEN RAISE EXCEPTION 'challenge_expired' USING ERRCODE = '22023'; END IF;
  IF v_chal.creator_player_id = v_player.id THEN RAISE EXCEPTION 'own_challenge' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_entry FROM public.arcade_challenge_entries
  WHERE challenge_id = v_chal.id AND player_id = v_player.id;
  IF FOUND THEN
    RETURN jsonb_build_object('state', v_entry.status, 'challenge', public.arcade_challenge_json(v_chal),
      'entry', to_jsonb(v_entry), 'alerts_created', 0);
  END IF;

  IF (SELECT count(*) FROM public.arcade_challenge_entries e
      WHERE e.player_id = v_player.id AND e.started_at > now() - interval '1 hour') >= 40 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.arcade_challenge_entries (challenge_id, player_id, role, status)
  VALUES (v_chal.id, v_player.id, 'challenger', 'started')
  RETURNING * INTO v_entry;

  PERFORM public.arcade_alert(v_chal.creator_player_id, v_player.id, 'rival_started', v_chal.id,
    v_player.handle || ' took your challenge',
    'They''re shooting now, trying to beat your ' || v_chal.target_score || '.',
    '/arcade/challenge/' || v_chal.id,
    jsonb_build_object('target', v_chal.target_score, 'rival_handle', v_player.handle));
  v_alerts := 1;

  RETURN jsonb_build_object('state', 'started', 'challenge', public.arcade_challenge_json(v_chal),
    'entry', to_jsonb(v_entry), 'alerts_created', v_alerts);
END;
$$;

-- The one score-submission path. Plain runs, challenge runs and seeded (ticket) runs all land in
-- arcade_scores exactly once, so they all count toward the boards with the same caps and limits.
CREATE OR REPLACE FUNCTION public.arcade_submit_run(
  p_device_id text, p_token text, p_game_id text, p_mode text, p_score int,
  p_meta jsonb DEFAULT '{}'::jsonb, p_run_id uuid DEFAULT NULL,
  p_challenge_id text DEFAULT NULL, p_ticket_id uuid DEFAULT NULL, p_contest_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_player public.arcade_players%ROWTYPE;
  v_game public.arcade_games%ROWTYPE;
  v_mode text;
  v_cap int;
  v_chal public.arcade_challenges%ROWTYPE;
  v_ticket public.arcade_seed_tickets%ROWTYPE;
  v_contest public.arcade_contests%ROWTYPE;
  v_row public.arcade_scores%ROWTYPE;
  v_entry public.arcade_challenge_entries%ROWTYPE;
  v_new_chal public.arcade_challenges%ROWTYPE;
  v_meta jsonb;
  v_match jsonb := NULL;
  v_created jsonb := NULL;
  v_created_err text := NULL;
  v_alerts int := 0;
  v_result text;
  v_winner uuid;
  v_lo uuid; v_hi uuid;
  v_creator_handle text;
  v_h2h_me jsonb; v_h2h_creator jsonb;
  v_body text;
  v_has_chal boolean := false;
  v_has_ticket boolean := false;
  v_dup boolean := false;
BEGIN
  v_player := public.arcade_auth(p_device_id, p_token);

  IF p_run_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.arcade_scores WHERE player_id = v_player.id AND run_id = p_run_id;
    IF FOUND THEN v_dup := true; END IF;
  END IF;

  IF NOT v_dup THEN
    SELECT * INTO v_game FROM public.arcade_games WHERE id = p_game_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown_game' USING ERRCODE = '22023'; END IF;
    IF v_game.status = 'coming_soon' THEN RAISE EXCEPTION 'game_not_live' USING ERRCODE = '22023'; END IF;

    IF p_challenge_id IS NOT NULL AND length(trim(p_challenge_id)) > 0 THEN
      SELECT * INTO v_chal FROM public.arcade_challenges WHERE id = trim(p_challenge_id);
      IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found' USING ERRCODE = 'P0002'; END IF;
      IF v_chal.game_id <> p_game_id THEN RAISE EXCEPTION 'challenge_game_mismatch' USING ERRCODE = '22023'; END IF;
      IF v_chal.expires_at < now() THEN RAISE EXCEPTION 'challenge_expired' USING ERRCODE = '22023'; END IF;
      v_has_chal := true;
    END IF;
    IF p_ticket_id IS NOT NULL THEN
      IF v_has_chal THEN RAISE EXCEPTION 'ticket_and_challenge' USING ERRCODE = '22023'; END IF;
      SELECT * INTO v_ticket FROM public.arcade_seed_tickets
      WHERE id = p_ticket_id AND player_id = v_player.id FOR UPDATE;
      IF NOT FOUND OR v_ticket.used_at IS NOT NULL OR v_ticket.created_at < now() - interval '2 hours'
         OR v_ticket.game_id <> p_game_id THEN
        RAISE EXCEPTION 'invalid_ticket' USING ERRCODE = '22023';
      END IF;
      v_has_ticket := true;
    END IF;

    v_mode := CASE WHEN v_has_chal OR v_has_ticket THEN 'challenge'
                   ELSE coalesce(nullif(trim(p_mode), ''), 'endless') END;
    IF v_mode NOT IN ('endless', 'timed60', 'challenge') THEN RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023'; END IF;
    IF p_score IS NULL OR p_score < 0 THEN RAISE EXCEPTION 'invalid_score' USING ERRCODE = '22023'; END IF;
    -- challenge runs are 60s runs: same cap as timed60
    v_cap := public.arcade_score_cap(p_game_id, CASE WHEN v_mode = 'challenge' THEN 'timed60' ELSE v_mode END);
    IF p_score > v_cap THEN RAISE EXCEPTION 'score_too_high' USING ERRCODE = '22023'; END IF;

    IF (SELECT count(*) FROM public.arcade_scores s
        WHERE s.player_id = v_player.id AND s.created_at > now() - interval '1 minute') >= 12 THEN
      RAISE EXCEPTION 'rate_limited' USING ERRCODE = '54000';
    END IF;

    IF p_contest_id IS NOT NULL THEN
      SELECT * INTO v_contest FROM public.arcade_contests WHERE id = p_contest_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'contest_not_found' USING ERRCODE = 'P0002'; END IF;
      IF NOT v_contest.is_active OR v_contest.starts_at > now() OR v_contest.ends_at < now()
         OR v_contest.game_id <> p_game_id THEN
        RAISE EXCEPTION 'contest_not_active' USING ERRCODE = '22023';
      END IF;
    END IF;

    v_meta := coalesce(p_meta, '{}'::jsonb);
    IF jsonb_typeof(v_meta) <> 'object' OR pg_column_size(v_meta) > 4000 THEN v_meta := '{}'::jsonb; END IF;
    IF v_has_ticket THEN v_meta := v_meta || jsonb_build_object('seed', v_ticket.seed, 'ticket_id', v_ticket.id); END IF;
    IF v_has_chal THEN v_meta := v_meta || jsonb_build_object('seed', v_chal.seed); END IF;

    INSERT INTO public.arcade_scores (game_id, mode, player_id, score, meta, challenge_id, contest_id, run_id)
    VALUES (p_game_id, v_mode, v_player.id, p_score, v_meta,
      CASE WHEN v_has_chal AND v_chal.creator_player_id <> v_player.id THEN v_chal.id ELSE NULL END,
      p_contest_id, p_run_id)
    RETURNING * INTO v_row;

    -- ── challenge result ──
    IF v_has_chal AND v_chal.creator_player_id <> v_player.id THEN
      SELECT * INTO v_entry FROM public.arcade_challenge_entries
      WHERE challenge_id = v_chal.id AND player_id = v_player.id FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO public.arcade_challenge_entries (challenge_id, player_id, role, status)
        VALUES (v_chal.id, v_player.id, 'challenger', 'started') RETURNING * INTO v_entry;
      END IF;
      SELECT handle INTO v_creator_handle FROM public.arcade_players WHERE id = v_chal.creator_player_id;

      IF v_entry.status = 'started' THEN
        v_result := CASE WHEN p_score > v_chal.target_score THEN 'win'
                         WHEN p_score < v_chal.target_score THEN 'loss' ELSE 'tie' END;
        UPDATE public.arcade_challenge_entries
        SET status = 'finished', score = p_score, score_id = v_row.id, result = v_result, finished_at = now()
        WHERE challenge_id = v_chal.id AND player_id = v_player.id
        RETURNING * INTO v_entry;

        v_winner := CASE v_result WHEN 'win' THEN v_player.id WHEN 'loss' THEN v_chal.creator_player_id ELSE NULL END;
        v_lo := least(v_player.id, v_chal.creator_player_id);
        v_hi := greatest(v_player.id, v_chal.creator_player_id);
        INSERT INTO public.arcade_rivalries AS r (game_id, player_lo, player_hi, lo_wins, hi_wins, ties,
          last_challenge_id, last_winner_id, last_lo_score, last_hi_score, last_played_at)
        VALUES (p_game_id, v_lo, v_hi,
          CASE WHEN v_winner = v_lo THEN 1 ELSE 0 END,
          CASE WHEN v_winner = v_hi THEN 1 ELSE 0 END,
          CASE WHEN v_winner IS NULL THEN 1 ELSE 0 END,
          v_chal.id, v_winner,
          CASE WHEN v_lo = v_player.id THEN p_score ELSE v_chal.target_score END,
          CASE WHEN v_hi = v_player.id THEN p_score ELSE v_chal.target_score END,
          now())
        ON CONFLICT (game_id, player_lo, player_hi) DO UPDATE SET
          lo_wins = r.lo_wins + EXCLUDED.lo_wins,
          hi_wins = r.hi_wins + EXCLUDED.hi_wins,
          ties = r.ties + EXCLUDED.ties,
          last_challenge_id = EXCLUDED.last_challenge_id,
          last_winner_id = EXCLUDED.last_winner_id,
          last_lo_score = EXCLUDED.last_lo_score,
          last_hi_score = EXCLUDED.last_hi_score,
          last_played_at = EXCLUDED.last_played_at;

        v_h2h_me := public.arcade_h2h(p_game_id, v_player.id, v_chal.creator_player_id);
        v_h2h_creator := public.arcade_h2h(p_game_id, v_chal.creator_player_id, v_player.id);
        v_body := CASE v_result
          WHEN 'win' THEN v_player.handle || ' beat you ' || p_score || '–' || v_chal.target_score || '. '
          WHEN 'loss' THEN 'You held on, ' || v_chal.target_score || '–' || p_score || '. '
          ELSE 'Dead even at ' || p_score || '. ' END
          || public.arcade_h2h_text(v_creator_handle, v_player.handle, v_h2h_creator) || '.';
        PERFORM public.arcade_alert(v_chal.creator_player_id, v_player.id, 'rival_finished', v_chal.id,
          v_player.handle || CASE v_result WHEN 'win' THEN ' won your challenge'
                                           WHEN 'loss' THEN ' came up short' ELSE ' tied you' END,
          v_body, '/arcade/challenge/' || v_chal.id,
          jsonb_build_object('result_for_you', CASE v_result WHEN 'win' THEN 'loss' WHEN 'loss' THEN 'win' ELSE 'tie' END,
            'your_score', v_chal.target_score, 'their_score', p_score, 'rival_handle', v_player.handle));
        v_alerts := v_alerts + 1;
        v_match := jsonb_build_object('counted', true, 'result', v_result, 'challenge_id', v_chal.id,
          'my_score', p_score, 'their_score', v_chal.target_score,
          'rival_player_id', v_chal.creator_player_id, 'rival_handle', v_creator_handle,
          'h2h', v_h2h_me, 'h2h_text', public.arcade_h2h_text(v_player.handle, v_creator_handle, v_h2h_me));
      ELSE
        v_match := jsonb_build_object('counted', false, 'result', v_entry.result, 'challenge_id', v_chal.id,
          'my_score', v_entry.score, 'their_score', v_chal.target_score,
          'rival_player_id', v_chal.creator_player_id, 'rival_handle', v_creator_handle,
          'h2h', public.arcade_h2h(p_game_id, v_player.id, v_chal.creator_player_id));
      END IF;
    END IF;

    -- ── seeded run → new challenge (open, or directed rematch) ──
    IF v_has_ticket THEN
      BEGIN
        v_new_chal := public.arcade_make_challenge(v_player.id, p_game_id, p_score, v_ticket.seed,
          v_ticket.opponent_player_id, v_ticket.parent_challenge_id, v_row.id);
        UPDATE public.arcade_seed_tickets SET used_at = now(), challenge_id = v_new_chal.id WHERE id = v_ticket.id;
        v_created := public.arcade_challenge_json(v_new_chal);
        IF v_ticket.opponent_player_id IS NOT NULL THEN
          PERFORM public.arcade_alert(v_ticket.opponent_player_id, v_player.id, 'your_turn', v_new_chal.id,
            v_player.handle || ' ran it back',
            v_player.handle || ' put up ' || p_score || '. Your turn.',
            '/arcade/challenge/' || v_new_chal.id,
            jsonb_build_object('target', p_score, 'rival_handle', v_player.handle));
          v_alerts := v_alerts + 1;
        END IF;
      EXCEPTION WHEN SQLSTATE '54000' THEN
        v_created_err := 'rate_limited';
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id, 'game_id', v_row.game_id, 'mode', v_row.mode, 'score', v_row.score,
    'player_id', v_player.id, 'handle', v_player.handle, 'is_guest', v_player.is_guest,
    'challenge_id', v_row.challenge_id, 'created_at', v_row.created_at, 'duplicate', v_dup,
    'personal_best', (SELECT coalesce(max(s.score), v_row.score) FROM public.arcade_scores s
                      WHERE s.player_id = v_player.id AND s.game_id = v_row.game_id AND s.mode = v_row.mode),
    'board', jsonb_build_object(
      'alltime', (SELECT jsonb_build_object('rank', b.rank, 'score', b.score) FROM public.arcade_board_ranked(v_row.game_id, 'alltime') b WHERE b.player_id = v_player.id),
      'weekly', (SELECT jsonb_build_object('rank', b.rank, 'score', b.score) FROM public.arcade_board_ranked(v_row.game_id, 'weekly') b WHERE b.player_id = v_player.id)),
    'match', v_match, 'created_challenge', v_created, 'created_challenge_error', v_created_err,
    'alerts_created', v_alerts);
END;
$$;

-- Public challenge card + VS data for a viewer (viewer id is a public uuid; no secrets returned).
CREATE OR REPLACE FUNCTION public.arcade_challenge_view(p_id text, p_viewer_player_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_chal public.arcade_challenges%ROWTYPE;
  v_entries jsonb;
  v_viewer jsonb := NULL;
  v_h2h jsonb := NULL;
  v_next jsonb := NULL;
  v_viewer_handle text;
BEGIN
  SELECT * INTO v_chal FROM public.arcade_challenges WHERE id = trim(coalesce(p_id, ''));
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('player_id', e.player_id, 'handle', p.handle, 'role', e.role,
      'status', e.status, 'score', e.score, 'result', e.result, 'finished_at', e.finished_at)
      ORDER BY (e.role = 'creator') DESC, e.score DESC NULLS LAST, e.started_at), '[]'::jsonb)
  INTO v_entries
  FROM (SELECT * FROM public.arcade_challenge_entries WHERE challenge_id = v_chal.id
        ORDER BY (role = 'creator') DESC, score DESC NULLS LAST LIMIT 25) e
  JOIN public.arcade_players p ON p.id = e.player_id;

  IF p_viewer_player_id IS NOT NULL THEN
    SELECT handle INTO v_viewer_handle FROM public.arcade_players WHERE id = p_viewer_player_id;
    SELECT to_jsonb(e) INTO v_viewer FROM public.arcade_challenge_entries e
    WHERE e.challenge_id = v_chal.id AND e.player_id = p_viewer_player_id;
    IF p_viewer_player_id <> v_chal.creator_player_id AND v_viewer_handle IS NOT NULL THEN
      v_h2h := public.arcade_h2h(v_chal.game_id, p_viewer_player_id, v_chal.creator_player_id);
      v_h2h := v_h2h || jsonb_build_object('text',
        public.arcade_h2h_text(v_viewer_handle, (SELECT handle FROM public.arcade_players WHERE id = v_chal.creator_player_id), v_h2h));
      SELECT public.arcade_challenge_json(c) INTO v_next FROM public.arcade_challenges c
      WHERE c.created_at > v_chal.created_at AND c.expires_at > now()
        AND ((c.creator_player_id = v_chal.creator_player_id AND c.opponent_player_id = p_viewer_player_id)
          OR (c.creator_player_id = p_viewer_player_id AND c.opponent_player_id = v_chal.creator_player_id))
      ORDER BY c.created_at DESC LIMIT 1;
    END IF;
  END IF;

  RETURN public.arcade_challenge_json(v_chal) || jsonb_build_object(
    'entries', v_entries, 'viewer_entry', v_viewer, 'h2h', v_h2h, 'next_challenge', v_next);
END;
$$;

-- Rivals list with records and whose turn it is.
CREATE OR REPLACE FUNCTION public.arcade_rivals(p_device_id text, p_token text, p_game_id text DEFAULT 'court-vision')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_me public.arcade_players%ROWTYPE;
  v_list jsonb;
BEGIN
  v_me := public.arcade_auth(p_device_id, p_token);
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'status') = 'your_turn' DESC, x->>'last_played_at' DESC NULLS LAST), '[]'::jsonb)
  INTO v_list
  FROM (
    SELECT jsonb_build_object(
      'rival_player_id', o.id, 'rival_handle', o.handle,
      'my_wins', CASE WHEN r.player_lo = v_me.id THEN r.lo_wins ELSE r.hi_wins END,
      'their_wins', CASE WHEN r.player_lo = v_me.id THEN r.hi_wins ELSE r.lo_wins END,
      'ties', r.ties,
      'last_played_at', r.last_played_at,
      'last_result', CASE WHEN r.last_winner_id IS NULL THEN 'tie' WHEN r.last_winner_id = v_me.id THEN 'win' ELSE 'loss' END,
      'last_my_score', CASE WHEN r.player_lo = v_me.id THEN r.last_lo_score ELSE r.last_hi_score END,
      'last_their_score', CASE WHEN r.player_lo = v_me.id THEN r.last_hi_score ELSE r.last_lo_score END,
      'last_challenge_id', r.last_challenge_id,
      'turn_challenge_id', t.id, 'turn_target', t.target_score,
      'waiting_challenge_id', w.id,
      'status', CASE WHEN t.id IS NOT NULL THEN 'your_turn' WHEN w.id IS NOT NULL THEN 'waiting' ELSE 'ready' END
    ) AS x
    FROM public.arcade_rivalries r
    JOIN public.arcade_players o ON o.id = CASE WHEN r.player_lo = v_me.id THEN r.player_hi ELSE r.player_lo END
    LEFT JOIN LATERAL (
      SELECT c.id, c.target_score FROM public.arcade_challenges c
      WHERE c.creator_player_id = o.id AND c.game_id = r.game_id AND c.expires_at > now()
        AND (c.opponent_player_id = v_me.id OR EXISTS (
          SELECT 1 FROM public.arcade_challenge_entries e2
          WHERE e2.challenge_id = c.id AND e2.player_id = v_me.id AND e2.status = 'started'))
        AND NOT EXISTS (SELECT 1 FROM public.arcade_challenge_entries e
          WHERE e.challenge_id = c.id AND e.player_id = v_me.id AND e.status = 'finished')
      ORDER BY c.created_at DESC LIMIT 1) t ON true
    LEFT JOIN LATERAL (
      SELECT c.id FROM public.arcade_challenges c
      WHERE c.creator_player_id = v_me.id AND c.game_id = r.game_id AND c.expires_at > now()
        AND (c.opponent_player_id = o.id OR EXISTS (
          SELECT 1 FROM public.arcade_challenge_entries e2
          WHERE e2.challenge_id = c.id AND e2.player_id = o.id AND e2.status = 'started'))
        AND NOT EXISTS (SELECT 1 FROM public.arcade_challenge_entries e
          WHERE e.challenge_id = c.id AND e.player_id = o.id AND e.status = 'finished')
      ORDER BY c.created_at DESC LIMIT 1) w ON true
    WHERE r.game_id = p_game_id AND (r.player_lo = v_me.id OR r.player_hi = v_me.id)
  ) s;

  RETURN jsonb_build_object('player', public.arcade_player_json(v_me), 'rivals', v_list,
    'unread', (SELECT count(*) FROM public.arcade_alerts a WHERE a.player_id = v_me.id AND a.read_at IS NULL));
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_inbox(p_device_id text, p_token text, p_after_id bigint DEFAULT 0, p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_me public.arcade_players%ROWTYPE; v_list jsonb;
BEGIN
  v_me := public.arcade_auth(p_device_id, p_token);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'title', a.title, 'body', a.body,
      'url', a.url, 'challenge_id', a.challenge_id, 'payload', a.payload, 'created_at', a.created_at,
      'read', a.read_at IS NOT NULL) ORDER BY a.id DESC), '[]'::jsonb)
  INTO v_list
  FROM (SELECT * FROM public.arcade_alerts WHERE player_id = v_me.id AND id > coalesce(p_after_id, 0)
        ORDER BY id DESC LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)) a;
  RETURN jsonb_build_object('alerts', v_list,
    'unread', (SELECT count(*) FROM public.arcade_alerts a WHERE a.player_id = v_me.id AND a.read_at IS NULL),
    'latest_id', (SELECT max(id) FROM public.arcade_alerts a WHERE a.player_id = v_me.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_inbox_read(p_device_id text, p_token text, p_upto_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_me public.arcade_players%ROWTYPE; v_n int;
BEGIN
  v_me := public.arcade_auth(p_device_id, p_token);
  UPDATE public.arcade_alerts SET read_at = now()
  WHERE player_id = v_me.id AND read_at IS NULL AND id <= coalesce(p_upto_id, 0);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('marked', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_push_subscribe(p_device_id text, p_token text, p_endpoint text,
  p_p256dh text, p_auth text, p_user_agent text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_me public.arcade_players%ROWTYPE; v_id uuid;
BEGIN
  v_me := public.arcade_auth(p_device_id, p_token);
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://' OR char_length(p_endpoint) > 1024 THEN
    RAISE EXCEPTION 'invalid_subscription' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.arcade_push_subscriptions (player_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_me.id, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  ON CONFLICT (endpoint) DO UPDATE SET player_id = EXCLUDED.player_id, p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, failure_count = 0
  RETURNING id INTO v_id;
  -- keep at most 5 devices per player
  DELETE FROM public.arcade_push_subscriptions WHERE id IN (
    SELECT id FROM public.arcade_push_subscriptions WHERE player_id = v_me.id
    ORDER BY created_at DESC OFFSET 5);
  RETURN jsonb_build_object('subscribed', true, 'subscription_id', v_id);
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'invalid_subscription' USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_push_unsubscribe(p_device_id text, p_token text, p_endpoint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_me public.arcade_players%ROWTYPE; v_n int;
BEGIN
  v_me := public.arcade_auth(p_device_id, p_token);
  DELETE FROM public.arcade_push_subscriptions WHERE player_id = v_me.id AND endpoint = p_endpoint;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('removed', v_n);
END;
$$;

-- Server-only (key-gated): claim pending push alerts. Throttles to 6 pushes / recipient / hour.
CREATE OR REPLACE FUNCTION public.arcade_push_dequeue(p_server_key text, p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
  v_alert public.arcade_alerts%ROWTYPE;
  v_out jsonb := '[]'::jsonb;
  v_subs jsonb;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.arcade_server_keys WHERE name = 'push'
    AND key_hash = public.arcade_sha256(coalesce(p_server_key, ''))) INTO v_ok;
  IF NOT v_ok OR char_length(coalesce(p_server_key, '')) < 32 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.arcade_alerts SET push_status = 'failed'
  WHERE push_status = 'pending' AND created_at < now() - interval '30 minutes';
  FOR v_alert IN
    SELECT * FROM public.arcade_alerts WHERE push_status = 'pending'
    ORDER BY created_at LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
    FOR UPDATE SKIP LOCKED
  LOOP
    IF (SELECT count(*) FROM public.arcade_alerts a WHERE a.player_id = v_alert.player_id
        AND a.push_status IN ('sending', 'sent') AND a.push_attempted_at > now() - interval '1 hour') >= 6 THEN
      UPDATE public.arcade_alerts SET push_status = 'throttled', push_attempted_at = now() WHERE id = v_alert.id;
      INSERT INTO public.arcade_push_log (alert_id, status, error) VALUES (v_alert.id, 'throttled', 'recipient_hourly_cap');
      CONTINUE;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    INTO v_subs FROM public.arcade_push_subscriptions s WHERE s.player_id = v_alert.player_id;
    IF jsonb_array_length(v_subs) = 0 THEN
      UPDATE public.arcade_alerts SET push_status = 'no_subscription' WHERE id = v_alert.id;
      CONTINUE;
    END IF;
    UPDATE public.arcade_alerts SET push_status = 'sending', push_attempted_at = now() WHERE id = v_alert.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object('alert_id', v_alert.id, 'kind', v_alert.kind,
      'title', v_alert.title, 'body', v_alert.body, 'url', v_alert.url, 'subscriptions', v_subs));
  END LOOP;
  RETURN jsonb_build_object('items', v_out);
END;
$$;

-- Server-only: record send results; prune gone subscriptions.
CREATE OR REPLACE FUNCTION public.arcade_push_report(p_server_key text, p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
  r jsonb;
  v_n int := 0;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.arcade_server_keys WHERE name = 'push'
    AND key_hash = public.arcade_sha256(coalesce(p_server_key, ''))) INTO v_ok;
  IF NOT v_ok OR char_length(coalesce(p_server_key, '')) < 32 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) LOOP
    INSERT INTO public.arcade_push_log (alert_id, subscription_id, status, http_status, error)
    VALUES ((r->>'alert_id')::bigint, nullif(r->>'subscription_id', '')::uuid,
      CASE WHEN r->>'status' IN ('sent','failed','gone','dry_run') THEN r->>'status' ELSE 'failed' END,
      nullif(r->>'http_status', '')::int, left(r->>'error', 300));
    IF r->>'status' = 'sent' THEN
      UPDATE public.arcade_push_subscriptions SET last_success_at = now(), failure_count = 0
      WHERE id = nullif(r->>'subscription_id', '')::uuid;
    ELSIF r->>'status' = 'gone' THEN
      DELETE FROM public.arcade_push_subscriptions WHERE id = nullif(r->>'subscription_id', '')::uuid;
    ELSIF r->>'status' = 'failed' THEN
      UPDATE public.arcade_push_subscriptions SET failure_count = failure_count + 1
      WHERE id = nullif(r->>'subscription_id', '')::uuid;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.arcade_alerts a SET push_status = CASE
      WHEN EXISTS (SELECT 1 FROM public.arcade_push_log l WHERE l.alert_id = a.id AND l.status IN ('sent','dry_run')) THEN 'sent'
      ELSE 'failed' END
  WHERE a.push_status = 'sending' AND a.id IN (
    SELECT DISTINCT (x->>'alert_id')::bigint FROM jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) x);
  RETURN jsonb_build_object('logged', v_n);
END;
$$;

-- ── grants ──
REVOKE ALL ON FUNCTION public.arcade_week_start() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_board_ranked(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_h2h(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_h2h_text(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_alert(uuid, uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_new_seed(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_make_challenge(uuid, text, int, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arcade_challenge_json(public.arcade_challenges) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.arcade_board(text, text, uuid, int)',
    'public.arcade_issue_ticket(text, text, text, uuid, text)',
    'public.arcade_challenge_from_score(text, text, uuid)',
    'public.arcade_challenge_start(text, text, text)',
    'public.arcade_submit_run(text, text, text, text, int, jsonb, uuid, text, uuid, uuid)',
    'public.arcade_challenge_view(text, uuid)',
    'public.arcade_rivals(text, text, text)',
    'public.arcade_inbox(text, text, bigint, int)',
    'public.arcade_inbox_read(text, text, bigint)',
    'public.arcade_push_subscribe(text, text, text, text, text, text)',
    'public.arcade_push_unsubscribe(text, text, text)',
    'public.arcade_push_dequeue(text, int)',
    'public.arcade_push_report(text, jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f);
  END LOOP;
END $$;
